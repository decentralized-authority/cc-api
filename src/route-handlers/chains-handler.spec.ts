import 'should';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DB } from '../db';
import { ChainsHandler } from './chains-handler';
import { createPoktAccount, generateId, generateSalt, hashPassword } from '../util';
import dayjs from 'dayjs';
import { Account } from './accounts-handler';
import { SessionToken } from './root-handler';
import { Chain } from '../interfaces';
import { DBUtils } from '../db-utils';

describe('ChainsHandler', function() {

  this.timeout(30000);

  let chainsHandler: ChainsHandler;
  let db: DB;
  let dbUtils: DBUtils;
  let account: Account;
  let sampleChain: Chain;
  let goodSessionToken: SessionToken;
  let expiredSessionToken: SessionToken;

  before(async function() {
    this.timeout(60000);
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
    );
    await db.initialize();
    dbUtils = new DBUtils(db);
    chainsHandler = new ChainsHandler(db);
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
    sampleChain = {
      id: '1234',
      name: 'Some Chain',
      portalPrefix: 'some-prefix',
      ticker: 'ABCDEFG',
      description: 'some description',
      blockchain: 'some blockchain',
      allowance: 5,
      enabled: true,
      isPartnerChain: false,
      billing: [],
    };
    await dbUtils.createChain(sampleChain);
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

  const runTokenTests = async function(handler: (event: APIGatewayProxyEvent)=>Promise<APIGatewayProxyResult>) {
    { // No token
      // @ts-ignore
      const res = await handler({
        resource: '',
        httpMethod: 'GET',
        pathParameters: {},
        headers: {},
      });
      res.should.be.an.Object();
      res.statusCode.should.equal(403);
      res.body.should.be.a.String();
    }
    { // Expired token
      // @ts-ignore
      const res = await handler({
        resource: '',
        httpMethod: 'GET',
        pathParameters: {},
        headers: {'x-api-key': expiredSessionToken.token},
      });
      res.should.be.an.Object();
      res.statusCode.should.equal(403);
      res.body.should.be.a.String();
    }
    { // Bad token
      // @ts-ignore
      const res = await handler({
        resource: '',
        httpMethod: 'GET',
        pathParameters: {},
        headers: {'x-api-key': '12345'},
      });
      res.should.be.an.Object();
      res.statusCode.should.equal(403);
      res.body.should.be.a.String();
    }
  };

  describe('.getChains()', function() {
    it('should get all available chains', async function() {
      await runTokenTests(chainsHandler.getChains);
      { // Good token
        // @ts-ignore
        const res = await chainsHandler.getChains({
          resource: '',
          httpMethod: 'GET',
          pathParameters: {},
          headers: {'x-api-key': goodSessionToken.token},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed: Chain[] = JSON.parse(res.body);
        parsed.should.be.an.Array();
        parsed.some(c => c.id === sampleChain.id).should.be.True();
      }
    });
  });

  describe('.getChain()', function() {
    it('should get all available chains', async function() {
      await runTokenTests(chainsHandler.getChain);
      { // Bad id
        // @ts-ignore
        const res = await chainsHandler.getChain({
          resource: '',
          httpMethod: 'GET',
          pathParameters: {id: 'somenonexistentchainid'},
          headers: {'x-api-key': goodSessionToken.token},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(404);
        res.body.should.be.a.String();
      }
      { // Good token
        // @ts-ignore
        const res = await chainsHandler.getChain({
          resource: '',
          httpMethod: 'GET',
          pathParameters: {id: sampleChain.id},
          headers: {'x-api-key': goodSessionToken.token},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed: Chain = JSON.parse(res.body);
        parsed.should.be.an.Object();
        parsed.id.should.equal(sampleChain.id);
      }
    });
  });

  after(async function() {
    this.timeout(60000);
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
    await dbUtils.deleteChain(sampleChain.id);
  });
});
