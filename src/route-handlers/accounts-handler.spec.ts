import 'should';
import { DB } from '../db';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Account, AccountsHandler } from './accounts-handler';
import { createPoktAccount, generateId, generateSalt, hashPassword } from '../util';
import dayjs from 'dayjs';
import { Node } from '../interfaces';
import { DBUtils } from '../db-utils';
import { SessionToken } from './root-handler';
import { PoktUtils } from '../pokt-utils';
import { EncryptionManager } from '../encryption-manager';

describe('AccountsHandler', function () {

  this.timeout(60000);

  let accountsHandler: AccountsHandler;
  const email = 'someone@something.com';
  const password = 'somepassword';
  const salt = generateSalt();
  let db: DB;
  let dbUtils: DBUtils;
  let account: Account;
  let goodSessionToken: SessionToken;
  let expiredSessionToken: SessionToken;
  let otherSessionToken: SessionToken;

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
    );
    await db.initialize();
    dbUtils = new DBUtils(db);
    const poktUtils = new PoktUtils(process.env.POKT_ENDPOINT || '');
    const encryptionManager = new EncryptionManager('someencryptionpassword');
    accountsHandler = new AccountsHandler(db, 'somerecaptchasecret', poktUtils, encryptionManager);
    const poktAccount = await createPoktAccount();
    const poktAccountPass = 'someencryptionpassword';
    const privateKeyEncrypted = encryptionManager.encrypt(poktAccount.privateKey);
    await dbUtils.createPoktAccount({
      address: poktAccount.address,
      publicKey: poktAccount.publicKey,
      privateKeyEncrypted,
    });
    const now = dayjs().toISOString();
    account = {
      id: generateId(),
      email,
      salt,
      passwordHash: hashPassword(password, salt),
      poktAddress: poktAccount.address,
      chainSalt: generateSalt(),
      agreeTos: true,
      agreeTosDate: now,
      agreePrivacyPolicy: true,
      agreePrivacyPolicyDate: now,
      agreeCookies: true,
      agreeCookiesDate: now,
    };
    await new Promise<void>((resolve, reject) => {
      db.Accounts.create(account, (err) => {
        if(err)
          reject(err);
        else {
          resolve();
        }
      });
    });
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
    otherSessionToken = {
      token: generateId(),
      user: generateId(),
      expiration: dayjs().add(1, 'day').toISOString(),
    };
    for(const sessionToken of [goodSessionToken, expiredSessionToken, otherSessionToken]) {
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

  const runTokenTests = async function(handler: (event: APIGatewayProxyEvent)=>Promise<APIGatewayProxyResult>) {
    { // No token
      // @ts-ignore
      const res = await handler({
        resource: '',
        httpMethod: '',
        pathParameters: {id: account.id},
        headers: {}
      });
      res.should.be.an.Object();
      res.statusCode.should.equal(403);
      res.body.should.be.a.String();
    }
    { // Expired token
      // @ts-ignore
      const res = await handler({
        resource: '',
        httpMethod: '',
        pathParameters: {id: account.id},
        headers: {'x-api-key': expiredSessionToken.token}
      });
      res.should.be.an.Object();
      res.statusCode.should.equal(403);
      res.body.should.be.a.String();
    }
    { // Wrong token
      // @ts-ignore
      const res = await handler({
        resource: '',
        httpMethod: '',
        pathParameters: {id: account.id},
        headers: {'x-api-key': otherSessionToken.token}
      });
      res.should.be.an.Object();
      res.statusCode.should.equal(403);
      res.body.should.be.a.String();
    }
    { // User not found
      // @ts-ignore
      const res = await handler({
        resource: '',
        httpMethod: '',
        pathParameters: {id: otherSessionToken.user},
        headers: {'x-api-key': otherSessionToken.token}
      });
      res.should.be.an.Object();
      res.statusCode.should.equal(404);
      res.body.should.be.a.String();
    }
  };

  describe('.getAccount()', function() {
    it('should get an account', async function() {
      await runTokenTests(accountsHandler.getAccount);
      { // Good user
        // @ts-ignore
        const res = await accountsHandler.getAccount({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.id.should.equal(account.id);
        parsed.email.should.equal(account.email);
        parsed.poktAddress.should.equal(account.poktAddress);
      }
    });
  });

  describe('.postAccountUpdateEmail()', function() {
    it('should update a user\'s email', async function() {
      const newEmail = 'some@newemail.com';
      const recaptchaToken = 'placeholderrecaptchatoken';
      { // No token
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdateEmail({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          headers: {}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Expired token
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdateEmail({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          headers: {'x-api-key': expiredSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Wrong token
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdateEmail({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          headers: {'x-api-key': otherSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // User not found
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdateEmail({
          resource: '',
          httpMethod: '',
          pathParameters: {id: otherSessionToken.user},
          headers: {'x-api-key': otherSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(404);
        res.body.should.be.a.String();
      }
      { // Invalid email
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdateEmail({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          body: JSON.stringify({email: 'someinvalidemail', recaptchaToken}),
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(400);
        res.body.should.be.a.String();
      }
      { // Invalid email type 1
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdateEmail({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          body: JSON.stringify({email: undefined, recaptchaToken}),
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(400);
        res.body.should.be.a.String();
      }
      { // Invalid email type 2
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdateEmail({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          body: JSON.stringify({email: 4, recaptchaToken}),
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(400);
        res.body.should.be.a.String();
      }
      { // Good user
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdateEmail({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          body: JSON.stringify({email: newEmail, recaptchaToken}),
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.should.equal(true);
        const accountFromDb = await new Promise<Account>((resolve, reject) => {
          db.Accounts.get(account.id, (err, item) => {
            if(err) {
              reject(err);
            } else {
              // @ts-ignore
              resolve(item.attrs as Account);
            }
          });
        });
        accountFromDb.email.should.equal(newEmail);
      }
    });
  });

  describe('.postAccountPrivateKey()', function() {
    it('should get the user\'s shared POKT account private key', async function() {
      await runTokenTests(accountsHandler.postAccountPrivateKey);
      { // Bad bodies
        const badBodies = [
          undefined,
          2,
          JSON.stringify('something'),
          JSON.stringify({password: undefined}),
          JSON.stringify({password: 2}),
        ];
        for(const body of badBodies) {
          // @ts-ignore
          const res = await accountsHandler.postAccountPrivateKey({body,
            resource: '',
            httpMethod: '',
            pathParameters: {id: account.id},
            headers: {'x-api-key': goodSessionToken.token}
          });
          res.should.be.an.Object();
          res.statusCode.should.equal(400);
          res.body.should.be.a.String();
        }
      }
      { // Wrong password
        // @ts-ignore
        const res = await accountsHandler.postAccountPrivateKey({
          resource: '',
          httpMethod: '',
          body: JSON.stringify({password: generateId()}),
          pathParameters: {id: account.id},
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Good token and password
        // @ts-ignore
        const res = await accountsHandler.postAccountPrivateKey({
          resource: '',
          httpMethod: '',
          body: JSON.stringify({password}),
          pathParameters: {id: account.id},
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const privateKey = JSON.parse(res.body);
        privateKey.should.be.a.String();
        privateKey.length.should.equal(128);
      }
    });
  });

  describe('.postAccountUpdatePassword()', function() {
    it('should update a user\'s password', async function() {

      const newPassword = 'somenewpassword';

      { // No token
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdatePassword({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          headers: {}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Expired token
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdatePassword({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          headers: {'x-api-key': expiredSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Wrong token
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdatePassword({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          headers: {'x-api-key': otherSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // User not found
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdatePassword({
          resource: '',
          httpMethod: '',
          pathParameters: {id: otherSessionToken.user},
          headers: {'x-api-key': otherSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(404);
        res.body.should.be.a.String();
      }
      { // Too short password
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdatePassword({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          body: JSON.stringify({currentPassword: password, newPassword: 'short'}),
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(400);
        res.body.should.be.a.String();
      }
      { // Invalid password type 1
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdatePassword({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          body: JSON.stringify({currentPassword: password, newPassword: undefined}),
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(400);
        res.body.should.be.a.String();
      }
      { // Invalid password type 2
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdatePassword({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          body: JSON.stringify({currentPassword: password, newPassword: 4}),
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(400);
        res.body.should.be.a.String();
      }
      { // Good user
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdatePassword({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          body: JSON.stringify({currentPassword: password, newPassword}),
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.should.equal(true);
        const accountFromDb = await new Promise<Account>((resolve, reject) => {
          db.Accounts.get(account.id, (err, item) => {
            if(err) {
              reject(err);
            } else {
              // @ts-ignore
              resolve(item.attrs as Account);
            }
          });
        });
        const hashed = hashPassword(newPassword, account.salt);
        accountFromDb.passwordHash.should.equal(hashed);
      }
    });
  });

  describe('.getAccountBalance()', function() {
    it('should get the account\'s balance in POKT', async function() {
      await runTokenTests(accountsHandler.getAccountBalance);
      { // Good token
        // @ts-ignore
        const res = await accountsHandler.getAccountBalance({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.should.be.a.String();
        const balanceNum = Number(parsed);
        balanceNum.should.be.aboveOrEqual(0);
      }
    });
  });

  describe('.postAccountDelete()', function() {

    let accountToDelete: Account;
    let sessionTokenToDelete0: SessionToken;
    let sessionTokenToDelete1: SessionToken;
    let nodeToDelete0: Node;
    let nodeToDelete1: Node;
    const password = generateId();

    before(async function() {
      const salt = generateSalt();
      const poktAccount = await createPoktAccount();
      const now = new Date().toISOString();
      accountToDelete = {
        id: generateId(),
        salt,
        email: `${generateId()}@email.com`,
        passwordHash: hashPassword(password, salt),
        poktAddress: poktAccount.address,
        chainSalt: generateSalt(),
        agreeTos: true,
        agreeTosDate: now,
        agreeCookies: true,
        agreeCookiesDate: now,
        agreePrivacyPolicy: true,
        agreePrivacyPolicyDate: now,
      };
      await new Promise<void>((resolve, reject) => {
        db.Accounts.create(accountToDelete, err => {
          if(err)
            reject(err);
          else
            resolve();
        });
      });
      sessionTokenToDelete0 = {
        token: generateId(),
        user: accountToDelete.id,
        expiration: now,
      };
      sessionTokenToDelete1 = {
        token: generateId(),
        user: accountToDelete.id,
        expiration: dayjs().add(1, 'day').toISOString(),
      };
      await Promise.all([sessionTokenToDelete0, sessionTokenToDelete1].map(s => {
        return new Promise<void>((resolve, reject) => {
          db.SessionTokens.create(s, err => {
            if(err)
              reject(err);
            else
              resolve();
          });
        });
      }));
      const poktAccount0 = await createPoktAccount();
      nodeToDelete0 = {
        id: generateId(),
        address: poktAccount0.address,
        user: accountToDelete.id,
        chains: [],
      };
      const poktAccount1 = await createPoktAccount();
      nodeToDelete1 = {
        id: generateId(),
        address: poktAccount1.address,
        user: accountToDelete.id,
        chains: [],
      };
      await Promise.all([nodeToDelete0, nodeToDelete1].map(n => dbUtils.createNode(n)));
    });

    it('should delete a user\'s account', async function () {
      { // No token
        // @ts-ignore
        const res = await accountsHandler.postAccountDelete({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          headers: {}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Expired token
        // @ts-ignore
        const res = await accountsHandler.postAccountDelete({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          headers: {'x-api-key': expiredSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Wrong token
        // @ts-ignore
        const res = await accountsHandler.postAccountDelete({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          headers: {'x-api-key': otherSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // User not found
        // @ts-ignore
        const res = await accountsHandler.postAccountDelete({
          resource: '',
          httpMethod: '',
          pathParameters: {id: otherSessionToken.user},
          headers: {'x-api-key': otherSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(404);
        res.body.should.be.a.String();
      }
      { // Bad password
        // @ts-ignore
        const res = await accountsHandler.postAccountDelete({
          resource: '',
          httpMethod: '',
          pathParameters: {id: accountToDelete.id},
          body: JSON.stringify({password: 'wrongpassword'}),
          headers: {'x-api-key': sessionTokenToDelete1.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(403);
        res.body.should.be.a.String();
      }
      { // Good user
        // @ts-ignore
        const res = await accountsHandler.postAccountDelete({
          resource: '',
          httpMethod: '',
          pathParameters: {id: accountToDelete.id},
          body: JSON.stringify({password}),
          headers: {'x-api-key': sessionTokenToDelete1.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.should.equal(true);
      }
    });
  });

  after(async function() {
    for(const sessionToken of [goodSessionToken, expiredSessionToken, otherSessionToken]) {
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
    if(account) {
      await dbUtils.deletePoktAccount(account.poktAddress);
      await new Promise<void>((resolve, reject) => {
        db.Accounts.destroy({id: account.id}, err => {
          if(err)
            reject(err);
          else
            resolve();
        });
      });
    }
  });

});
