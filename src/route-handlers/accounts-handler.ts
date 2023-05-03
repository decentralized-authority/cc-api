import { DB } from '../db';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  checkRecaptcha, generateChainUrl,
  getAccountFromToken,
  goodBody, goodEmail, goodPassword,
  hashPassword,
  httpErrorResponse,
  httpResponse,
  response400,
  response403
} from '../util';
import omit from 'lodash/omit';
import isPlainObject from 'lodash/isPlainObject';
import isString from 'lodash/isString';
import { DBUtils } from '../db-utils';
import { RouteHandler } from '../route-handler';
import bindAll from 'lodash/bindAll';
import { SessionToken } from './root-handler';
import { PoktUtils } from '../pokt-utils';
import { EncryptionManager } from '../encryption-manager';
import { ChainHost, RoutingTablesChange } from '../interfaces';
import isArray from 'lodash/isArray';
import { SecretManager } from '../secret-manager';
import { envVars, routingChangeType, secretsKeys } from '../constants';
import { QueueManager } from '../queue-manager';
import uniq from 'lodash/uniq';
import isNumber from 'lodash/isNumber';

export interface Account {
  id: string
  email: string
  salt: string
  passwordHash: string
  domains: string[]
  poktAddress: string
  chainSalt: string
  isPartner: boolean
  agreeTos: boolean,
  agreeTosDate: string,
  agreePrivacyPolicy: boolean,
  agreePrivacyPolicyDate: string,
  agreeCookies: boolean,
  agreeCookiesDate: string,
  chains: ChainHost[],
  disabled: boolean,
}

export interface AccountDeletePostBody {
  password: string
}

export interface UpdatePasswordPostBody {
  currentPassword: string
  newPassword: string
}

export interface UpdateEmailPostBody {
  email: string
  recaptchaToken: string
}

export interface PrivateKeyPostBody {
  password: string
}

export interface AccountAddChainPostBody {
  id: string
}
export interface AccountUpdateChainsPostBody {
  chains: string[]
}
export interface AccountRelayInvoicesPostBody {
  count: number
}

export class AccountsHandler extends RouteHandler {

  _db: DB;
  _dbUtils: DBUtils;
  _recaptchaSecret: string;
  _poktUtils: PoktUtils;
  _secretManager: SecretManager;
  _qm: QueueManager;

  constructor(db: DB, recaptchaSecret: string, poktUtils: PoktUtils, secretManager: SecretManager, qm: QueueManager) {
    super();
    this._db = db;
    this._dbUtils = new DBUtils(db);
    this._recaptchaSecret = recaptchaSecret;
    this._poktUtils = poktUtils;
    this._secretManager = secretManager;
    this._qm = qm;
    bindAll(this, [
      'getAccount',
      'postAccountUpdateEmail',
      'postAccountUpdatePassword',
      'postAccountDelete',
      'getAccountBalance',
      'postAccountPrivateKey',
      'postAccountAddChain',
      'postAccountRemoveChain',
      'postAccountUpdateChains',
      'postAccountRelayInvoices',
    ]);
  }

  async getAccount(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const [ errResponse, account ] = await getAccountFromToken(this._db, event, event.pathParameters?.id || '');
    if(errResponse)
      return errResponse;
    else
      return httpResponse(200, omit(account, ['salt', 'passwordHash', 'chainSalt']));
  }

  async postAccountUpdateEmail(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event, event.pathParameters?.id || '');
    if(errResponse)
      return errResponse;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    const { email, recaptchaToken } = parsed as UpdateEmailPostBody;
    if(!isString(email) || !goodEmail(email))
      return httpErrorResponse(400, 'Invalid email address.');
    if(!isString(recaptchaToken))
      return httpErrorResponse(400, 'Missing recaptchaToken');

    if(process.env.NODE_ENV !== 'development') {
      const success = checkRecaptcha(this._recaptchaSecret, recaptchaToken);
      if(!success)
        return httpErrorResponse(403, 'Invalid recaptcha response');
    }

    await new Promise<void>((resolve, reject) => {
      this._db.Accounts.update({id: account.id, email}, err => {
        if(err)
          reject(err);
        else
          resolve();
      });
    });
    return httpResponse(200, true);
  }

  async postAccountUpdatePassword(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event, event.pathParameters?.id || '');
    if(errResponse)
      return errResponse;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    const { currentPassword, newPassword } = parsed as UpdatePasswordPostBody;
    if(!currentPassword || !newPassword)
      return response400('Body must include currentPassword and newPassword strings.');
    const hashedCurrent = hashPassword(currentPassword, account?.salt);
    if(hashedCurrent !== account?.passwordHash)
      return response403('Invalid currentPassword');
    else if(!goodPassword(newPassword))
      return httpErrorResponse(400, 'Password must be string at least twelve characters long.');
    const hashedNew = hashPassword(newPassword, account.salt);
    await new Promise<void>((resolve, reject) => {
      this._db.Accounts.update({id: account.id, passwordHash: hashedNew}, err => {
        if(err)
          reject(err);
        else
          resolve();
      });
    });
    return httpResponse(200, true);
  }

  async postAccountDelete(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event, event.pathParameters?.id || '');
    if(errResponse)
      return errResponse;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    const { password } = parsed as AccountDeletePostBody;
    if(!password)
      return response400('Body must include password strings.');
    const hashed = hashPassword(password, account?.salt);
    if(hashed !== account?.passwordHash)
      return response403('Invalid password');
    // Delete user nodes
    const nodes = await this._dbUtils.getNodesByUser(account.id);
    await Promise.all(nodes.map(n => this._dbUtils.deleteNode(n.id)));
    // Delete user session tokens
    const sessionTokens = await new Promise<SessionToken[]>((resolve, reject) => {
      this._db.SessionTokens
        .scan()
        .loadAll()
        .where('user').equals(account.id)
        .exec((err, { Items }) => {
          if(err) {
            reject(err);
          } else {
            // @ts-ignore
            resolve(Items.map(i => i.attrs));
          }
        });
    });
    await Promise.all(sessionTokens.map(s => {
      return new Promise<void>((resolve, reject) => {
        this._db.SessionTokens.destroy({token: s.token}, err => {
          if(err)
            reject(err);
          else
            resolve();
        });
      });
    }));
    // Delete user account
    await this._dbUtils.deleteAccount(account.id);
    if(process.env.NODE_ENV !== 'development') {
      const changeParams: RoutingTablesChange = {
        user: account.id,
        type: routingChangeType.DELETE_ACCOUNT,
        chains: [],
      };
      await this._qm.routingTablesChange.sendMessage(changeParams);
    }
    return httpResponse(200, true);
  }

  async getAccountBalance(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const [ errResponse, account ] = await getAccountFromToken(this._db, event, event.pathParameters?.id || '');
    if(errResponse)
      return errResponse;
    const balance = await this._poktUtils.getBalance(account?.poktAddress);
    return httpResponse(200, balance);
  }

  async postAccountPrivateKey(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event, event.pathParameters?.id || '');
    if(errResponse)
      return errResponse;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    const { password } = parsed as PrivateKeyPostBody;
    if(!password || !isString(password))
      return response400('Body must include password string.');
    const hashedPassword = hashPassword(password, account?.salt);
    if(hashedPassword !== account?.passwordHash)
      return response403('Invalid password.');
    const poktAccount = await this._dbUtils.getPoktAccount(account.poktAddress);
    if(!poktAccount)
      return httpErrorResponse(500, 'Internal server error');
    let encryptionManager: EncryptionManager;
    if(process.env[envVars.POKT_ACCOUNT_PASS]) {
      encryptionManager = new EncryptionManager(process.env[envVars.POKT_ACCOUNT_PASS] as string);
    } else {
      const { SecretString: poktAccountPass } = await this._secretManager.getSecret(secretsKeys.POKT_ACCOUNT_PASS);
      if(!poktAccountPass)
        return httpErrorResponse(500);
      encryptionManager = new EncryptionManager(poktAccountPass);
    }
    const privateKey = encryptionManager.decrypt(poktAccount.privateKeyEncrypted);
    return httpResponse(200, privateKey);
  }

  async postAccountAddChain(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event, event.pathParameters?.id || '');
    if(errResponse)
      return errResponse;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { id } = parsed as AccountAddChainPostBody;
    if(!id || !isString(id))
      return httpErrorResponse(400, 'Request must include a chain id string');
    const chain = await this._dbUtils.getChain(id);
    if(!chain)
      return httpErrorResponse(400, 'Invalid chain id');
    if((chain.isPartnerChain && !account?.isPartner) || !chain.enabled)
      return httpErrorResponse(403);
    const prev = account.chains.find(c => c.id === id);
    if(prev)
      return httpResponse(200, prev);
    const newChain = {
      id,
      host: generateChainUrl(account, id),
    };
    const prevHostChain = await this._dbUtils.getUserChainHost(newChain.host);
    if(!prevHostChain)
      await this._dbUtils.createUserChainHost({
        host: newChain.host,
        user: account.id,
        chain: id,
      });
    const newChains = [
      ...account.chains,
      newChain,
    ];
    await this._dbUtils.updateAccount(account.id, {chains: newChains});
    if(process.env.NODE_ENV !== 'development') {
      const changeParams: RoutingTablesChange = {
        user: account.id,
        type: routingChangeType.ADD_CHAIN,
        chains: [id],
      };
      await this._qm.routingTablesChange.sendMessage(changeParams);
    }
    return httpResponse(200, newChain);
  }

  async postAccountRemoveChain(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event, pathParameters?.id || '');
    if(errResponse)
      return errResponse;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { id } = parsed as AccountAddChainPostBody;
    if(!id || !isString(id))
      return httpErrorResponse(400, 'Request must include a chain id string');
    const newChains = account.chains
      .filter((c) => c.id !== id);
    await this._dbUtils.updateAccount(account.id, {chains: newChains});
    if(process.env.NODE_ENV !== 'development') {
      const changeParams: RoutingTablesChange = {
        user: account.id,
        type: routingChangeType.REMOVE_CHAIN,
        chains: [id],
      };
      await this._qm.routingTablesChange.sendMessage(changeParams);
    }
    return httpResponse(200, true);
  }

  async postAccountUpdateChains(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event, event.pathParameters?.id || '');
    if(errResponse)
      return errResponse;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { chains } = parsed as AccountUpdateChainsPostBody;
    if(!chains || !isArray(chains))
      return httpErrorResponse(400, 'Request must include a chains array of id string');
    chains = uniq(chains);
    const newChains: ChainHost[] = [];
    for(const id of chains) {
      if(!isString(id))
        return httpErrorResponse(400, `Invalid chain ID ${id}`);
      const chain = await this._dbUtils.getChain(id);
      if(!chain)
        return httpErrorResponse(400, `Invalid chain ID ${id}`);
      newChains.push({
        id,
        host: generateChainUrl(account, id),
      });
    }
    let prevUserChainHosts = await Promise.all(newChains.map(c => this._dbUtils.getUserChainHost(c.host)));
    const filteredNewChains = newChains.filter(c => !prevUserChainHosts.some((p) => p ? p.host === c.host : false));
    await Promise.all(filteredNewChains
      .map(c => this._dbUtils.createUserChainHost({
        host: c.host,
        user: account.id,
        chain: c.id,
      })));
    await this._dbUtils.updateAccount(account.id, {chains: newChains});
    if(process.env.NODE_ENV !== 'development') {
      const changeParams: RoutingTablesChange = {
        user: account.id,
        type: routingChangeType.UPDATE_CHAINS,
        chains,
      };
      await this._qm.routingTablesChange.sendMessage(changeParams);
    }
    return httpResponse(200, newChains);
  }

  async postAccountRelayInvoices(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event, pathParameters?.id || '');
    if(errResponse)
      return errResponse;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { count } = parsed as AccountRelayInvoicesPostBody;
    if(!count || !isNumber(count))
      return httpErrorResponse(400, 'Request body must include a count number');
    const relayInvoices = await this._dbUtils.getRelayInvoicesByUser(account.id, count);
    return httpResponse(200, relayInvoices
      .map((invoice) => {
        return {
          ...invoice,
          relays: invoice.relays
            .map((relayInvoiceRelays) => omit(relayInvoiceRelays, ['providerBreakdown'])),
        };
      }));
  }

}
