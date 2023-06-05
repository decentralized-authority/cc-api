import 'should';
import {
  InviteHandlerPostBody,
  RegisterHandlerPostBody,
  RootHandler,
  SessionToken,
  UnlockHandlerPostBody
} from './root-handler';
import { DB } from '../db';
import Mailgun from 'mailgun.js';
import formData from 'form-data';
import { createPoktAccount, generateId, generateSalt, hashPassword } from '../util';
import dayjs from 'dayjs';
import { Invitation } from '../interfaces';
import { Account } from './accounts-handler';
import { DEFAULT_ACCOUNT_DELETE_TIMEOUT, DEFAULT_DOMAIN_DELETE_TIMEOUT, routes } from '../constants';
import fs from 'fs-extra';
import path from 'path';
import { EncryptionManager } from '../encryption-manager';
import { PoktUtils } from '../pokt-utils';
import { DBUtils } from '../db-utils';
import { SecretManager } from '../secret-manager';

describe('RootHandler', function() {

  this.timeout(60000);

  let rootHandler: RootHandler;
  let db: DB;
  let dbUtils: DBUtils;
  let poktUtils: PoktUtils;
  let account: Account;
  let goodSessionToken: SessionToken;
  let expiredSessionToken: SessionToken;
  let goodSessionToken1: SessionToken;

  const { MAILGUN_KEY, MAILGUN_DOMAIN, POKT_ENDPOINT } = process.env;
  if(!MAILGUN_KEY)
    throw new Error(`You must enter a MAILGUN_KEY environment variable.`);
  if(!MAILGUN_DOMAIN)
    throw new Error(`You must enter a MAILGUN_DOMAIN environment variable.`);
  const mailgun = new Mailgun(formData);
  const mg = mailgun.client({username: 'api', key: MAILGUN_KEY});

  before(async function() {
    db = new DB(
      'ccAccounts-test',
      'ccNodes-test',
      'ccChains-test',
      'ccSessionTokens-test',
      'ccInvitations-test',
      'ccPoktAccounts-test',
      'ccProviders-test',
      'ccGateways-test',
      'ccRpcEndpoints-test',
      'ccUserChainHosts-test',
      'ccUserDomains-test',
      'ccDeletedAccounts-test',
      'ccDeletedNodes-test',
      'ccDeletedUserDomains-test',
      'ccRelayInvoices-test',
      'ccApiKeys-test',
    );
    await db.initialize();
    dbUtils = new DBUtils(db);
    poktUtils = new PoktUtils(POKT_ENDPOINT || '');
    const encryptionManager = new EncryptionManager('someencryptionpassword');
    const secretManager = new SecretManager();
    rootHandler = new RootHandler(db, mg, MAILGUN_DOMAIN, 'somerecaptchasecret', poktUtils, DEFAULT_ACCOUNT_DELETE_TIMEOUT, DEFAULT_DOMAIN_DELETE_TIMEOUT, secretManager);
    const poktAccount = await createPoktAccount();
    const now = dayjs().toISOString();
    const salt = generateSalt();
    account = {
      id: generateId(),
      email: `${generateId()}@email.com`,
      salt,
      passwordHash: hashPassword(generateId(), salt),
      domains: [`${generateId()}.com`],
      poktAddress: poktAccount.address,
      chainSalt: generateSalt(),
      agreeTos: true,
      agreeTosDate: now,
      agreePrivacyPolicy: true,
      agreePrivacyPolicyDate: now,
      agreeCookies: true,
      agreeCookiesDate: now,
      isPartner: false,
      chains: [],
      disabled: false,
    };
    await dbUtils.createAccount(account);
    goodSessionToken = {
      token: generateId(),
      user: account.id,
      expiration: dayjs().add(1, 'day').toISOString(),
    };
    expiredSessionToken = {
      token: generateId(),
      user: account.id,
      expiration: dayjs().subtract(1, 'day').toISOString(),
    };
    for(const sessionToken of [goodSessionToken, expiredSessionToken]) {
      await new Promise<void>((resolve, reject) => {
        db.SessionTokens.create(sessionToken, (err) => {
          if(err)
            reject(err);
          else {
            resolve();
          }
        });
      });
    }
  });

  describe('.getVersion()', function() {
    it('should return the project version', async function() {
      // @ts-ignore
      const res = await rootHandler.getVersion({resource: routes.VERSION, httpMethod: 'GET'});
      res.should.be.an.Object();
      res.statusCode.should.equal(200);
      res.body.should.be.a.String();
      const version = JSON.parse(res.body);
      version.should.equal(fs.readJsonSync(path.resolve(__dirname, '../../package.json')).version);
    });
  });

  describe('.postInvite()', function() {

    const email = 'testing0@verify.nodepilot.tech';
    const alreadyInvitedEmail = 'testing1@verify.nodepilot.tech';
    const alreadyInvitedButExpiredEmail = 'testing2@verify.nodepilot.tech';
    const alreadyRegisteredEmail = 'testing3@verify.nodepilot.tech';
    let currentInvitation: Invitation;
    let expiredInvitation: Invitation;
    let prevAccount: Account;

    before(async function() {
      currentInvitation = {
        id: generateId(),
        expiration: dayjs().add(12, 'hours').toISOString(),
        email: alreadyInvitedEmail,
      };
      expiredInvitation = {
        id: generateId(),
        expiration: dayjs().subtract(1, 'day').toISOString(),
        email: alreadyInvitedButExpiredEmail,
      };
      for(const invitation of [currentInvitation, expiredInvitation]) {
        await new Promise<void>((resolve, reject) => {
          db.Invitations.create(invitation, (err) => {
            if(err)
              reject(err);
            else {
              resolve();
            }
          });
        });
      }
      {
        const password = 'somelongpassword';
        const salt = generateSalt();
        const poktAccount = await createPoktAccount();
        const now = dayjs().toISOString();
        prevAccount = {
          id: generateId(),
          email: alreadyRegisteredEmail,
          salt,
          passwordHash: hashPassword(password, salt),
          domains: [`${generateId()}.com`],
          poktAddress: poktAccount.address,
          chainSalt: generateSalt(),
          agreeTos: true,
          agreeTosDate: now,
          agreePrivacyPolicy: true,
          agreePrivacyPolicyDate: now,
          agreeCookies: true,
          agreeCookiesDate: now,
          isPartner: false,
          chains: [],
          disabled: false,
        };
        await dbUtils.createAccount(prevAccount);
      }
    });

    it('should create a new invite', async function() {
      { // Bad body
        const badBodies = [
          2,
          "2",
          undefined,
          JSON.stringify({}),
          JSON.stringify({email: '', recaptchaToken: 'something'}),
          JSON.stringify({email: '           ', recaptchaToken: 'something'}),
          JSON.stringify({email: 'someone@something.com', recaptchaToken: undefined}),
          JSON.stringify({email: 'notavalidemailaddress', recaptchaToken: 'something'}),
          JSON.stringify({email: undefined, recaptchaToken: 'something'}),
        ];
        for(const body of badBodies) {
          // @ts-ignore
          const res = await rootHandler.postInvite({resource: '', httpMethod: '', body});
          res.should.be.an.Object();
          res.statusCode.should.equal(400);
          res.body.should.be.a.String();
        }
      }
      { // Invalid recaptcha token
        const badBodies = [
          JSON.stringify({email: 'someone@something.com', recaptchaToken: ''}),
          JSON.stringify({email: 'someone@something.com', recaptchaToken: '           '}),
        ];
        for(const body of badBodies) {
          // @ts-ignore
          const res = await rootHandler.postInvite({resource: '', httpMethod: '', body});
          res.should.be.an.Object();
          res.statusCode.should.equal(403);
          res.body.should.be.a.String();
        }
      }
      { // Invitation exists
        const invitationExistsBody: InviteHandlerPostBody = {
          email: alreadyInvitedEmail,
          recaptchaToken: 'something',
        };
        // @ts-ignore
        const res = await rootHandler.postInvite({resource: '', httpMethod: '', body: JSON.stringify(invitationExistsBody)});
        res.should.be.an.Object();
        res.statusCode.should.equal(400);
        res.body.should.be.a.String();
      }
      { // Already registered email
        const alreadyRegisteredInviteBody: InviteHandlerPostBody = {
          email: alreadyRegisteredEmail,
          recaptchaToken: 'something',
        };
        // @ts-ignore
        const res = await rootHandler.postInvite({resource: '', httpMethod: '', body: JSON.stringify(alreadyRegisteredInviteBody)});
        res.should.be.an.Object();
        res.statusCode.should.equal(400);
        res.body.should.be.a.String();
      }
      { // ExpiredInvitation exists
        const invitationExistsButExpiredBody: InviteHandlerPostBody = {
          email: alreadyInvitedButExpiredEmail,
          recaptchaToken: 'something',
        };
        // @ts-ignore
        const res = await rootHandler.postInvite({resource: '', httpMethod: '', body: JSON.stringify(invitationExistsButExpiredBody)});
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
      }
      { // Good email
        const invitationBody: InviteHandlerPostBody = {
          email,
          recaptchaToken: 'something',
        };
        // @ts-ignore
        const res = await rootHandler.postInvite({resource: '', httpMethod: '', body: JSON.stringify(invitationBody)});
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
      }
    });

    after(async function() {
      for(const emailAddress of [email, alreadyInvitedEmail, alreadyInvitedButExpiredEmail]) {
        const invitationsToRemove = await new Promise<Invitation[]>((resolve, reject) => {
          db.Invitations
            .scan()
            .loadAll()
            .where('email').equals(emailAddress)
            .exec((err, { Items }) => {
              if(err) {
                reject(err);
              } else {
                // @ts-ignore
                resolve(Items.map(item => item.attrs));
              }
            });
        });
        await Promise.all(invitationsToRemove.map(i => new Promise<void>((resolve, reject) => {
          db.Invitations.destroy({id: i.id}, err => {
            if(err)
              reject(err);
            else
              resolve();
          });
        })));
      }
      if(prevAccount)
        await dbUtils.deleteAccount(prevAccount.id);
    });
  });

  describe('.postRegister()', function() {

    const email = 'someone@something.com';
    const password = 'somepassword';
    let goodInvitation: Invitation;
    let expiredInvitation: Invitation;
    let account: Account;
    const email1 = `${generateId()}@${generateId()}.com`;
    let goodInvitation1: Invitation;

    before(async function() {
      goodInvitation = {
        id: generateId(),
        expiration: dayjs().add(1, 'day').toISOString(),
        email,
      };
      expiredInvitation = {
        id: generateId(),
        expiration: dayjs().subtract(1, 'day').toISOString(),
        email,
      };
      goodInvitation1 = {
        id: generateId(),
        expiration: dayjs().add(1, 'day').toISOString(),
        email: email1,
      };
      for(const invitation of [goodInvitation, expiredInvitation, goodInvitation1]) {
        await new Promise<void>((resolve, reject) => {
          db.Invitations.create(invitation, (err) => {
            if(err)
              reject(err);
            else {
              resolve();
            }
          });
        });
      }
    });

    it('should register a new account', async function() {
      { // Expired invitation
        const expiredRegisterBody: RegisterHandlerPostBody = {
          email,
          password,
          domain: `${generateId()}.com`,
          invitation: expiredInvitation.id,
          agreeTos: true,
          agreePrivacyPolicy: true,
          agreeCookies: true,
        };
        // @ts-ignore
        const res = await rootHandler.postRegister({resource: '', httpMethod: '', body: JSON.stringify(expiredRegisterBody)});
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Bad invitation
        const badInvitationRegisterBody: RegisterHandlerPostBody = {
          email,
          password,
          domain: `${generateId()}.com`,
          invitation: 'non-existent invitation',
          agreeTos: true,
          agreePrivacyPolicy: true,
          agreeCookies: true,
        };
        // @ts-ignore
        const res = await rootHandler.postRegister({resource: '', httpMethod: '', body: JSON.stringify(badInvitationRegisterBody)});
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Bad body
        const badBodies = [
          2,
          "2",
          undefined,
          JSON.stringify({}),
          JSON.stringify({email: '', password, invitation: 'something'}),
          JSON.stringify({email: '           ', password, invitation: 'something'}),
          JSON.stringify({email: 'notavalidemailaddress', password, invitation: 'something'}),
          JSON.stringify({email: undefined, password, invitation: 'something'}),
          JSON.stringify({email, password: '', invitation: 'something'}),
          JSON.stringify({email, password: '           ', invitation: 'something'}),
          JSON.stringify({email, password: 'shortpw', invitation: 'something'}),
          JSON.stringify({email, password: undefined, invitation: 'something'}),
        ];
        for(const body of badBodies) {
          // @ts-ignore
          const res = await rootHandler.postRegister({resource: '', httpMethod: '', body});
          res.should.be.an.Object();
          res.statusCode.should.equal(400);
          res.body.should.be.a.String();
        }
      }
      { // Good invitation
        const goodRegisterBody: RegisterHandlerPostBody = {
          email,
          password,
          domain: `${generateId()}.com`,
          invitation: goodInvitation.id,
          agreeTos: true,
          agreePrivacyPolicy: true,
          agreeCookies: true,
        };
        // @ts-ignore
        const res = await rootHandler.postRegister({resource: '', httpMethod: '', body: JSON.stringify(goodRegisterBody)});
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        account = JSON.parse(res.body);
        account.should.be.an.Object();
        account.id.should.be.a.String();
        account.email.should.be.a.String();
        account.poktAddress.should.be.a.String();
      }
      { // bad domains
        const badDomains = [
          undefined,
          '',
          'notadomain',
          '.com',            // incomplete
          'abc%def.com',     // forbidden characters 0
          'abc.def.com/',    // forbidden characters 1
          'abc def.com',     // forbidden characters 2
          'abc.com,def.com', // forbidden characters 3
          account.domains,   // duplicate domain
        ];
        for(const domain of badDomains) {
          // @ts-ignore
          const registerBody: RegisterHandlerPostBody = {domain,
            email: email1,
            password,
            invitation: goodInvitation1.id,
            agreeTos: true,
            agreePrivacyPolicy: true,
            agreeCookies: true,
          };
          // @ts-ignore
          const res = await rootHandler.postRegister({resource: '', httpMethod: '', body: JSON.stringify(registerBody)});
          res.should.be.an.Object();
          res.statusCode.should.equal(400);
        }
      }
    });

    after(async function() {
      for(const invitation of [goodInvitation, expiredInvitation, goodInvitation1]) {
        if(!invitation)
          continue;
        await new Promise<void>((resolve, reject) => {
          db.Invitations.destroy({id: invitation.id}, err => {
            if(err)
              reject(err);
            else
              resolve();
          });
        });
      }
      if(account)
        await dbUtils.deleteAccount(account.id);
      await new Promise<void>((resolve, reject) => {
        db.PoktAccounts.destroy({address: account.poktAddress}, err => {
          if(err)
            reject(err);
          else
            resolve();
        });
      });
    });
  });

  describe('.postUnlock()', function() {

    const email = 'someone@something.com';
    const password = 'somepassword';
    const salt = generateSalt();
    let account: Account;
    let sessionToken: SessionToken;

    before(async function() {
      const { MAILGUN_KEY, MAILGUN_DOMAIN } = process.env;

      if(!MAILGUN_KEY)
        throw new Error(`You must enter a MAILGUN_KEY environment variable.`);
      if(!MAILGUN_DOMAIN)
        throw new Error(`You must enter a MAILGUN_DOMAIN environment variable.`);

      const mailgun = new Mailgun(formData);
      const mg = mailgun.client({username: 'api', key: MAILGUN_KEY});

      db = new DB(
        'ccAccounts-test',
        'ccNodes-test',
        'ccChains-test',
        'ccSessionTokens-test',
        'ccInvitations-test',
        'ccPoktAccounts-test',
        'ccProviders-test',
        'ccGateways-test',
        'ccRpcEndpoints-test',
        'ccUserChainHosts-test',
        'ccUserDomains-test',
        'ccDeletedAccounts-test',
        'ccDeletedNodes-test',
        'ccDeletedUserDomains-test',
        'ccRelayInvoices-test',
        'ccApiKeys-test',
      );
      await db.initialize();
      const secretManager = new SecretManager();
      rootHandler = new RootHandler(db, mg, MAILGUN_DOMAIN, 'somerecaptchasecret', poktUtils, DEFAULT_ACCOUNT_DELETE_TIMEOUT, DEFAULT_DOMAIN_DELETE_TIMEOUT, secretManager);

      const now = dayjs().toISOString();
      account = {
        id: generateId(),
        email,
        salt,
        passwordHash: hashPassword(password, salt),
        domains: [`${generateId()}.com`],
        poktAddress: '12345',
        chainSalt: generateSalt(),
        agreeTos: true,
        agreeTosDate: now,
        agreePrivacyPolicy: true,
        agreePrivacyPolicyDate: now,
        agreeCookies: true,
        agreeCookiesDate: now,
        isPartner: false,
        chains: [],
        disabled: false,
      };
      await dbUtils.createAccount(account);
    });

    it('should generate a new session token', async function() {
      { // Bad body
        const badBodies = [
          2,
          "2",
          undefined,
          JSON.stringify({}),
          JSON.stringify({email: '', password}),
          JSON.stringify({email: '           ', password}),
          JSON.stringify({email: 'notavalidemailaddress', password}),
          JSON.stringify({email: undefined, password}),
          JSON.stringify({email, password: ''}),
          JSON.stringify({email, password: '           '}),
          JSON.stringify({email, password: 'shortpw'}),
          JSON.stringify({email, password: undefined}),
        ];
        for(const body of badBodies) {
          // @ts-ignore
          const res = await rootHandler.postUnlock({resource: '', httpMethod: '', body});
          res.should.be.an.Object();
          res.statusCode.should.equal(400);
          res.body.should.be.a.String();
        }
      }
      { // Bad email
        const body: UnlockHandlerPostBody = {
          email: 'some@wrongemail.address',
          password,
        };
        // @ts-ignore
        const res = await rootHandler.postUnlock({resource: '', httpMethod: '', body: JSON.stringify(body)});
        res.should.be.an.Object();
        res.statusCode.should.equal(401);
        res.body.should.be.a.String();
      }
      { // Bad password
        const body: UnlockHandlerPostBody = {
          email,
          password: 'somewrongpassword',
        };
        // @ts-ignore
        const res = await rootHandler.postUnlock({resource: '', httpMethod: '', body: JSON.stringify(body)});
        res.should.be.an.Object();
        res.statusCode.should.equal(401);
        res.body.should.be.a.String();
      }
      { // Good credentials
        const body: UnlockHandlerPostBody = {
          email,
          password,
        };
        // @ts-ignore
        const res = await rootHandler.postUnlock({resource: '', httpMethod: '', body: JSON.stringify(body)});
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        sessionToken = JSON.parse(res.body);
        sessionToken.should.be.an.Object();
        sessionToken.token.should.be.a.String();
        sessionToken.user.should.equal(account.id)
        sessionToken.expiration.should.be.a.String();
        dayjs(sessionToken.expiration).isAfter(dayjs()).should.be.True();
      }
    });

    after(async function() {
      if(sessionToken)
        await new Promise<void>((resolve, reject) => {
          db.SessionTokens.destroy({token: sessionToken.token}, err => {
            if(err)
              reject(err);
            else
              resolve();
          });
        });
      if(account)
        await dbUtils.deleteAccount(account.id);
    });
  });

  describe('.postQueryPoktNodes()', function() {
    it('should get POKT query node responses', async function() {
      { // No token
        // @ts-ignore
        const res = await rootHandler.postQueryPoktNodes({
          resource: '',
          httpMethod: '',
          pathParameters: {},
          headers: {},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Expired token
        // @ts-ignore
        const res = await rootHandler.postQueryPoktNodes({
          resource: '',
          httpMethod: '',
          pathParameters: {},
          headers: {'x-api-key': expiredSessionToken.token},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Bad token
        // @ts-ignore
        const res = await rootHandler.postQueryPoktNodes({
          resource: '',
          httpMethod: '',
          pathParameters: {},
          headers: {'x-api-key': '12345'},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Bad body
        const badBodies = [
          2,
          "2",
          undefined,
          JSON.stringify({}),
          JSON.stringify({addresses: ''}),
          JSON.stringify({addresses: 2}),
        ];
        for(const body of badBodies) {
          // @ts-ignore
          const res = await rootHandler.postQueryPoktNodes({resource: '', httpMethod: '', headers: {'x-api-key': goodSessionToken.token}, body});
          res.should.be.an.Object();
          res.statusCode.should.equal(400);
          res.body.should.be.a.String();
        }
      }
      { // Good token
        const account0 = await createPoktAccount();
        const account1 = await createPoktAccount();
        const account2 = await createPoktAccount();
        const addresses = [
          account0.address,
          account1.address,
          account2.address,
        ];
        // @ts-ignore
        const res = await rootHandler.postQueryPoktNodes({
          resource: '',
          httpMethod: '',
          pathParameters: {},
          body: JSON.stringify({addresses}),
          headers: {'x-api-key': goodSessionToken.token},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.should.be.an.Object();
        Object.keys(parsed).length.should.equal(addresses.length);
      }
    });
  });

  after(async function() {
    for(const sessionToken of [goodSessionToken, expiredSessionToken]) {
      if(sessionToken)
        await new Promise<void>((resolve, reject) => {
          db.SessionTokens.destroy({token: sessionToken.token}, err => {
            if(err)
              reject(err);
            else
              resolve();
          });
        });
    }
    if(account)
      await dbUtils.deleteAccount(account.id);
  });

});
