import { DB } from '../db';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  checkRecaptcha,
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

export interface Account {
  id: string
  email: string
  salt: string
  passwordHash: string
  poktAddress: string
  chainSalt: string
  agreeTos: boolean,
  agreeTosDate: string,
  agreePrivacyPolicy: boolean,
  agreePrivacyPolicyDate: string,
  agreeCookies: boolean,
  agreeCookiesDate: string,
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

export class AccountsHandler extends RouteHandler {

  _db: DB;
  _dbUtils: DBUtils;
  _recaptchaSecret: string;
  _poktUtils: PoktUtils;
  _encryptionManager: EncryptionManager;

  constructor(db: DB, recaptchaSecret: string, poktUtils: PoktUtils, encryptionManager: EncryptionManager) {
    super();
    this._db = db;
    this._dbUtils = new DBUtils(db);
    this._recaptchaSecret = recaptchaSecret;
    this._poktUtils = poktUtils;
    this._encryptionManager = encryptionManager;
    bindAll(this, [
      'getAccount',
      'postAccountUpdateEmail',
      'postAccountUpdatePassword',
      'postAccountDelete',
      'getAccountBalance',
      'postAccountPrivateKey',
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
    await new Promise<void>((resolve, reject) => {
      this._db.Accounts.destroy({id: account.id}, err => {
        if(err)
          reject(err);
        else
          resolve();
      });
    });
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
    const nodes = await this._dbUtils.getNodesByUser(account.id);
    await Promise.all(nodes.map(n => this._dbUtils.deleteNode(n.id)));
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
    const privateKey = this._encryptionManager.decrypt(poktAccount.privateKeyEncrypted);
    return httpResponse(200, privateKey);
  }

}
