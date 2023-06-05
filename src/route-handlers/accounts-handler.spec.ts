import should from 'should';
import { DB } from '../db';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Account, AccountsHandler } from './accounts-handler';
import { createPoktAccount, generateId, generateSalt, hashPassword, httpErrorResponse } from '../util';
import dayjs from 'dayjs';
import { Node, RelayInvoice } from '../interfaces';
import { DBUtils } from '../db-utils';
import { SessionToken } from './root-handler';
import { PoktUtils } from '../pokt-utils';
import { SecretManager } from '../secret-manager';
import { EncryptionManager } from '../encryption-manager';
import { envVars, secretsKeys } from '../constants';
import { QueueManager } from '../queue-manager';

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
  let relayInvoices: RelayInvoice[];

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
    const poktUtils = new PoktUtils(process.env.POKT_ENDPOINT || '');
    const secretManager = new SecretManager();
    const qm = new QueueManager(process.env.CC_ROUTING_TABLES_CHANGE_QUEUE_URL || '');
    accountsHandler = new AccountsHandler(db, 'somerecaptchasecret', poktUtils, secretManager, qm);
    const poktAccount = await createPoktAccount();
    const poktAccountPass = 'someencryptionpassword';
    let encryptionManager: EncryptionManager;
    if(process.env[envVars.POKT_ACCOUNT_PASS]) {
      encryptionManager = new EncryptionManager(process.env[envVars.POKT_ACCOUNT_PASS] as string);
    } else {
      const { SecretString: poktAccountPass } = await secretManager.getSecret(secretsKeys.POKT_ACCOUNT_PASS);
      if(!poktAccountPass)
        return httpErrorResponse(500);
      encryptionManager = new EncryptionManager(poktAccountPass);
    }
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
    relayInvoices = [
      {
        id: generateId(),
        user: account.id,
        date: dayjs().subtract(1, 'day').valueOf(),
        total: '1010',
        relays: [],
        providersPaid: false,
        ccPaid: false,
      },
      {
        id: generateId(),
        user: account.id,
        date: dayjs().valueOf(),
        total: '1000',
        relays: [],
        providersPaid: false,
        ccPaid: false,
      },
      {
        id: generateId(),
        user: account.id,
        date: dayjs().subtract(3, 'days').valueOf(),
        total: '1030',
        relays: [],
        providersPaid: false,
        ccPaid: false,
      },
      {
        id: generateId(),
        user: account.id,
        date: dayjs().subtract(2, 'days').valueOf(),
        total: '1020',
        relays: [],
        providersPaid: false,
        ccPaid: false,
      },
    ];
    await Promise.all(relayInvoices.map((invoice) => dbUtils.createRelayInvoice(invoice)));
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
        const accountFromDb = await dbUtils.getAccount(account.id);
        should(accountFromDb).not.be.Null();
        should(accountFromDb?.email).equal(newEmail);
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
        const accountFromDb = await dbUtils.getAccount(account.id);
        const hashed = hashPassword(newPassword, account.salt);
        should(accountFromDb).not.be.Null();
        should(accountFromDb?.passwordHash).equal(hashed);
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

  describe('.postAccountAddChain()', function() {
    it('should add a chain to an account', async function() {
      await runTokenTests(accountsHandler.postAccountAddChain);
      { // Bad bodies
        const badBodies = [
          undefined,
          2,
          JSON.stringify('something'),
          JSON.stringify({id: undefined}),
          JSON.stringify({id: 2}),
          JSON.stringify({id: generateId()}),
        ];
        for(const body of badBodies) {
          // @ts-ignore
          const res = await accountsHandler.postAccountAddChain({resource: '', httpMethod: '', pathParameters: {id: account.id}, body, headers: {'x-api-key': goodSessionToken.token}});
          res.should.be.an.Object();
          res.statusCode.should.equal(400);
          res.body.should.be.a.String();
        }
      }
      { // Good token
        const chains = await dbUtils.getChains();
        const chain = chains.find((c) => !c.isPartnerChain && c.enabled);
        // @ts-ignore
        const res = await accountsHandler.postAccountAddChain({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          body: JSON.stringify({id: chain?.id}),
          headers: {'x-api-key': goodSessionToken.token},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.id.should.equal(chain?.id);
        parsed.host.should.be.a.String();
        const accountFromDb = await dbUtils.getAccount(account.id);
        const { chains: chainsFromDb } = accountFromDb || {};
        // @ts-ignore
        const idx = chainsFromDb.findIndex(c => c.id === chain.id);
        idx.should.be.above(-1);
        // @ts-ignore
        chainsFromDb[idx].id.should.equal(chain.id);
        // @ts-ignore
        chainsFromDb[idx].host.should.equal(parsed.host);
      }
    });
  });

  describe('.postNodeUpdateChains()', function() {
    it('should update a chain\'s nodes', async function() {
      await runTokenTests(accountsHandler.postAccountUpdateChains);
      { // Bad bodies
        const badBodies = [
          undefined,
          2,
          JSON.stringify('something'),
          JSON.stringify({chains: undefined}),
          JSON.stringify({chains: 2}),
          JSON.stringify({chains: [generateId()]}),
        ];
        for(const body of badBodies) {
          // @ts-ignore
          const res = await accountsHandler.postAccountUpdateChains({resource: '', httpMethod: '', pathParameters: {id: account.id}, body, headers: {'x-api-key': goodSessionToken.token}});
          res.should.be.an.Object();
          res.statusCode.should.equal(400);
          res.body.should.be.a.String();
        }
      }
      { // Good token
        const chains = await dbUtils.getChains();
        const chainsToAdd = chains
          .filter((c) => !c.isPartnerChain && c.enabled)
          .slice(-2);
        // @ts-ignore
        const res = await accountsHandler.postAccountUpdateChains({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          body: JSON.stringify({chains: chainsToAdd.map(c => c.id)}),
          headers: {'x-api-key': goodSessionToken.token},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.should.be.an.Array();
        parsed.length.should.equal(chainsToAdd.length);
        for(let i = 0; i < parsed.length; i++) {
          parsed[i].id.should.equal(chainsToAdd[i].id);
          parsed[i].host.should.be.a.String();
        }
        const accountFromDb = await dbUtils.getAccount(account.id);
        const { chains: chainsFromDb } = accountFromDb as Account;
        chainsFromDb.length.should.equal(chainsToAdd.length);
        for(let i = 0; i < chainsFromDb.length; i++) {
          chainsFromDb[i].id.should.equal(chainsToAdd[i].id);
          chainsFromDb[i].host.should.equal(parsed[i].host);
        }
      }
    });
  });

  describe('.postAccountRemoveChain()', function() {
    it('should remove a chain from an account', async function() {
      await runTokenTests(accountsHandler.postAccountRemoveChain);
      { // Bad bodies
        const badBodies = [
          undefined,
          2,
          JSON.stringify('something'),
          JSON.stringify({id: undefined}),
          JSON.stringify({id: 2}),
        ];
        for(const body of badBodies) {
          // @ts-ignore
          const res = await accountsHandler.postAccountRemoveChain({resource: '', httpMethod: '', pathParameters: {id: account.id}, body, headers: {'x-api-key': goodSessionToken.token}});
          res.should.be.an.Object();
          res.statusCode.should.equal(400);
          res.body.should.be.a.String();
        }
      }
      { // Good token
        // @ts-ignore
        const { chains } = await dbUtils.getAccount(account.id);
        const chainToRemove = chains[0].id;
        // @ts-ignore
        const res = await accountsHandler.postAccountRemoveChain({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          body: JSON.stringify({id: chainToRemove}),
          headers: {'x-api-key': goodSessionToken.token},
        });
        res.should.be.a.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.should.be.a.Boolean();
        const accountFromDb = await dbUtils.getAccount(account.id);
        const { chains: chainsFromDb } = accountFromDb || {};
        // @ts-ignore
        chainsFromDb.some((c) => c.id === chainToRemove).should.be.False();
      }
    });
  });

  describe('.postAccountRelayInvoices', function() {
    it('should get the account\'s recent relay invoices', async function() {
      await runTokenTests(accountsHandler.postAccountRelayInvoices);
      { // Bad bodies
        const badBodies = [
          undefined,
          2,
          JSON.stringify(2),
          JSON.stringify({}),
          JSON.stringify({count: undefined}),
          JSON.stringify({count: 'something'}),
        ];
        for(const body of badBodies) {
          // @ts-ignore
          const res = await accountsHandler.postAccountRelayInvoices({resource: '', httpMethod: '', pathParameters: {id: account.id}, body, headers: {'x-api-key': goodSessionToken.token}});
          res.should.be.an.Object();
          res.statusCode.should.equal(400);
          res.body.should.be.a.String();
        }
      }
      { // Good token
        const count = 3;
        // @ts-ignore
        const res = await accountsHandler.postAccountRelayInvoices({
          resource: '',
          httpMethod: '',
          pathParameters: {id: account.id},
          body: JSON.stringify({count}),
          headers: {'x-api-key': goodSessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed: RelayInvoice[] = JSON.parse(res.body);
        parsed.should.be.an.Array();
        parsed.length.should.equal(count);
        const sortedRelayInvoices = [...relayInvoices]
          .sort((a, b) => b.date - a.date);
        for(let i = 0; i < parsed.length; i++) {
          parsed[i].id.should.equal(sortedRelayInvoices[i].id);
        }
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
        domains: [`${generateId()}.com`],
        poktAddress: poktAccount.address,
        chainSalt: generateSalt(),
        agreeTos: true,
        agreeTosDate: now,
        agreeCookies: true,
        agreeCookiesDate: now,
        agreePrivacyPolicy: true,
        agreePrivacyPolicyDate: now,
        isPartner: false,
        chains: [],
        disabled: false,
      };
      await dbUtils.createAccount(accountToDelete);
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
      };
      const poktAccount1 = await createPoktAccount();
      nodeToDelete1 = {
        id: generateId(),
        address: poktAccount1.address,
        user: accountToDelete.id,
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
      await dbUtils.deleteAccount(account.id);
    }
    await Promise.all(relayInvoices.map((invoice) => dbUtils.deleteRelayInvoice(invoice.id)));
  });

});
