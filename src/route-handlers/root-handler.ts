import { RouteHandler } from '../route-handler';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DB } from '../db';
import Client from 'mailgun.js/client';
import {
  checkRecaptcha, createPoktAccount,
  generateId,
  generateSalt, getAccountFromToken,
  goodBody,
  goodEmail,
  goodPassword, hashPassword,
  httpErrorResponse,
  httpResponse
} from '../util';
import isPlainObject from 'lodash/isPlainObject';
import isString from 'lodash/isString';
import { Invitation } from '../interfaces';
import dayjs from 'dayjs';
import { Account } from './accounts-handler';
import omit from 'lodash/omit';
import fs from 'fs-extra';
import path from 'path';
import { EncryptionManager } from '../encryption-manager';
import bindAll from 'lodash/bindAll';
import { PoktQueryNodeResponse, PoktUtils } from '../pokt-utils';
import isArray from 'lodash/isArray';
import { DBUtils } from '../db-utils';

export interface InviteHandlerPostBody {
  email: string
  recaptchaToken: string
}

export interface RegisterHandlerPostBody {
  email: string
  password: string
  invitation: string
  agreeTos: boolean,
  agreePrivacyPolicy: boolean,
  agreeCookies: boolean,
}

export interface UnlockHandlerPostBody {
  email: string
  password: string
}

export interface SessionToken {
  token: string
  user: string
  expiration: string
}

export interface QueryPoktNodesPostBody {
  addresses: string[]
}

export class RootHandler extends RouteHandler {

  _db: DB;
  _dbUtils: DBUtils;
  _mg: Client;
  _emailDomain: string;
  _recaptchaSecret: string;
  _encryptionManager: EncryptionManager;
  _poktUtils: PoktUtils;

  constructor(db: DB, mg: Client, emailDomain: string, recaptchaSecret: string, encryptionManager: EncryptionManager, poktUtils: PoktUtils) {
    super();
    this._db = db;
    this._dbUtils = new DBUtils(db);
    this._mg = mg;
    this._emailDomain = emailDomain;
    this._recaptchaSecret = recaptchaSecret;
    this._encryptionManager = encryptionManager;
    this._poktUtils = poktUtils;
    bindAll(this, [
      'getVersion',
      'postInvite',
      'postRegister',
      'postUnlock',
      'postQueryPoktNodes',
    ]);
  }

  async getVersion(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { version } = await fs.readJson(path.resolve(__dirname, '../../package.json'));
    return httpResponse(200, version);
  }

  async postInvite(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body } = event;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { email, recaptchaToken } = parsed as InviteHandlerPostBody;
    if(!isString(email) || !isString(recaptchaToken))
      return httpErrorResponse(400, 'Request must include email and recaptchaToken');
    recaptchaToken = recaptchaToken.trim();
    if(!recaptchaToken)
      return httpErrorResponse(403, 'Request must include recaptchaToken');

    if(process.env.NODE_ENV !== 'development') {
      const success = checkRecaptcha(this._recaptchaSecret, recaptchaToken);
      if(!success)
        return httpErrorResponse(403, 'Invalid recaptcha response');
    }

    email = email.trim().toLowerCase();
    if(!email || !goodEmail(email))
      return httpErrorResponse(400, 'valid email required');
    const prevInvitations = await new Promise<Invitation[]>((resolve, reject) => {
      this._db.Invitations
        .scan()
        .loadAll()
        .where('email').equals(email)
        .exec((err, { Items }) => {
          if(err) {
            reject(err);
          } else {
            // @ts-ignore
            resolve(Items.map(item => item.attrs));
          }
        });
    });
    const now = dayjs();
    const validInvitations = prevInvitations
      .filter(i => dayjs(i.expiration).isAfter(now));
    if(validInvitations.length > 0) {
      return httpErrorResponse(400, `Previous invitation found for ${email}. You will need to use that invitation or wait until it expires before requesting a new one.`);
    }
    const emailExists = await new Promise<boolean>((resolve, reject) => {
      this._db.Accounts
        .scan()
        .loadAll()
        .where('email').equals(email)
        .exec((err, { Items }) => {
          if(err)
            reject(err);
          else
            resolve(Items.length > 0);
        });
    });
    if(emailExists)
      return httpErrorResponse(400, 'Invalid email address');
    const invitation: Invitation = {
      id: generateId(),
      expiration: now.add(1, 'day').toISOString(),
      email,
    };
    await new Promise<void>((resolve, reject) => {
      this._db.Invitations.create(invitation, err => {
        if(err)
          reject(err);
        else
          resolve();
      });
    });

    await this._mg.messages.create(this._emailDomain, {
      from: 'no-reply@verify.nodepilot.tech',
      to: email,
      subject: 'Community Chains Invite',
      text:`Thank you for requesting an invite to use our Community Chains service! The registration link below is good for twenty-four hours. Follow the link to register your account.\n\n${`https://portal.nodepilot.tech/register/?email=${encodeURIComponent(email)}&invitation=${invitation.id}`}`,
    });

    return httpResponse(200, invitation.expiration);
  }

  async postRegister(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body } = event;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { email, password, invitation, agreeTos, agreePrivacyPolicy, agreeCookies } = parsed as RegisterHandlerPostBody;
    if(!isString(email) || !isString(password) || !isString(invitation))
      return httpErrorResponse(400, 'email, password, and invitations strings required');
    invitation = invitation.trim();
    if(!invitation)
      return httpErrorResponse(403, 'invitation required');
    email = email.trim().toLowerCase();
    if(!email || !goodEmail(email) || !goodPassword(password))
      return httpErrorResponse(400, 'valid email and password required');
    if(!agreeTos || !agreePrivacyPolicy || !agreeCookies)
      return httpErrorResponse(400, 'You must agree to all terms of service before you can register');
    const invitationFromDB: Invitation|null = await new Promise<any>((resolve, reject) => {
      this._db.Invitations.get(invitation, (err, item) => {
        if(err) {
          reject(err);
        } else {
          // @ts-ignore
          resolve(item ? item.attrs : null);
        }
      });
    });
    if(!invitationFromDB || dayjs(invitationFromDB.expiration).isBefore(dayjs()))
      return httpErrorResponse(403, 'invalid invitation');
    else if(invitationFromDB.email !== email)
      return httpErrorResponse(403, 'invalid email for invitation');
    const emailExists = await new Promise<boolean>((resolve, reject) => {
      this._db.Accounts
        .scan()
        .loadAll()
        .where('email').equals(email)
        .exec((err, { Items }) => {
          if(err)
            reject(err);
          else
            resolve(Items.length > 0);
        });
    });
    if(emailExists)
      return httpErrorResponse(400, 'email already registered');
    const id = generateId();
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const chainSalt = generateSalt();
    const poktAccount = await createPoktAccount();
    await new Promise<void>((resolve, reject) => {
      this._db.PoktAccounts.create({
        address: poktAccount.address,
        publicKey: poktAccount.publicKey,
        privateKeyEncrypted: this._encryptionManager.encrypt(poktAccount.privateKey),
      }, err => {
        if(err)
          reject(err);
        else
          resolve();
      });
    });
    const poktAddress = poktAccount.address;
    const today = dayjs().toISOString();
    const account: Account = {
      id,
      email,
      salt,
      passwordHash,
      poktAddress,
      chainSalt,
      agreeTos,
      agreeTosDate: today,
      agreePrivacyPolicy,
      agreePrivacyPolicyDate: today,
      agreeCookies,
      agreeCookiesDate: today,
      isPartner: false,
      chains: [],
    };
    await this._dbUtils.createAccount(account);
    return httpResponse(200, omit(account, ['salt', 'passwordHash', 'chainSalt']));
  }

  async postUnlock(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body } = event;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { email, password } = parsed as UnlockHandlerPostBody;
    if(!isString(email) || !isString(password))
      return httpErrorResponse(400, 'email and password strings required');
    email = email.trim().toLowerCase();
    if(!email || !goodEmail(email) || !goodPassword(password))
      return httpErrorResponse(400, 'valid email and password required');
    const [ account ] = await this._dbUtils.getAccountsByEmail(email);
    if(!account)
      return httpErrorResponse(401, 'invalid account credentials');
    const passwordHash = hashPassword(password, account.salt);
    if(passwordHash !== account.passwordHash)
      return httpErrorResponse(401, 'invalid account credentials');
    const newToken: SessionToken = {
      token: generateId(),
      user: account.id,
      expiration: dayjs().add(1, 'day').toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      this._db.SessionTokens
        .create(newToken, err => {
          if(err)
            reject(err);
          else
            resolve();
        });
    });
    return httpResponse(200, newToken);
  }

  async postQueryPoktNodes(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event);
    if(errResponse)
      return errResponse;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { addresses } = parsed as QueryPoktNodesPostBody;
    if(!isArray(addresses))
      return httpErrorResponse(400, 'addresses array required');
    const nodes = await Promise.all(addresses.map(a => this._poktUtils.getNode(a)));
    const addressToNode: {[address: string]: PoktQueryNodeResponse|null} = {};
    for(let i = 0; i < addresses.length; i++ ) {
      addressToNode[addresses[i]] = nodes[i];
    }
    return httpResponse(200, addressToNode);
  }

}
