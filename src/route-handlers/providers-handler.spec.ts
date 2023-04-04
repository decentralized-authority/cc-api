import should from 'should';
import {
  Gateway,
  Provider,
  ProvidersHandler,
  ProviderUnlockPostBody
} from './providers-handler';
import { DB } from '../db';
import { createPoktAccount, generateGateway, generateId, generateSalt, hashPassword } from '../util';
import { DBUtils } from '../db-utils';
import { SessionToken } from './root-handler';
import dayjs from 'dayjs';
import { Node, RpcEndpoint } from '../interfaces';
import { Account } from './accounts-handler';

describe('ProvidersHandler', function() {

  this.timeout(30000);

  let providersHandler: ProvidersHandler;
  let db: DB;
  let dbUtils: DBUtils;
  let provider: Provider;
  let sessionToken: SessionToken;
  const key = generateId();
  let gateways: Gateway[] = [];
  let rpcEndpoints: RpcEndpoint[] = [];
  let otherRpcEndpoints: RpcEndpoint[] = [];
  let nodes: Node[] = [];
  let users: Account[] = [];

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
    );
    await db.initialize();
    dbUtils = new DBUtils(db);
    providersHandler = new ProvidersHandler(db);
    const keySalt = generateSalt();
    provider = {
      id: generateId(),
      name: 'Test Provider',
      email: `${generateId()}@test.com`,
      keyHash: hashPassword(key, keySalt),
      keySalt,
      poktAddress: generateId(),
      agreeTos: true,
      agreeTosDate: new Date().toISOString(),
      agreePrivacyPolicy: true,
      agreePrivacyPolicyDate: new Date().toISOString(),
    };
    await dbUtils.createProvider(provider);
    sessionToken = {
      token: generateId(),
      user: provider.id,
      expiration: dayjs().add(1, 'day').toISOString(),
    };
    await dbUtils.createSessionToken(sessionToken);
    for(let i = 0; i < 3; i++) {
      gateways.push(generateGateway(
        provider.id,
        'us-east-1',
        `10.10.10.${i}`,
        `192.168.10.${i}`,
        'somediscordwebhookurl',
      ));
    }
    await Promise.all(gateways.map(gateway => dbUtils.createGateway(gateway)));
    for(let i = 0; i < 3; i++) {
      rpcEndpoints.push({
        id: generateId(),
        chainId: `00${i}1`,
        gateway: gateways[0].id,
        protocol: 'http',
        address: `10.10.10.${i}`,
        port: 8080 + i,
        disabled: false,
      });
    }
    for(let i = 0; i < 2; i++) {
      otherRpcEndpoints.push({
        id: generateId(),
        chainId: `00${i}1`,
        gateway: gateways[1].id,
        protocol: 'http',
        address: `10.10.10.${i}`,
        port: 8080 + i,
        disabled: false,
      });
    }
    await Promise.all([...rpcEndpoints, ...otherRpcEndpoints].map(rpcEndpoint => dbUtils.createRpcEndpoint(rpcEndpoint)));

    for(let i = 0; i < rpcEndpoints.length; i++) {
      const poktAccount = await createPoktAccount();
      nodes.push({
        id: generateId(),
        address: poktAccount.address,
        user: generateId(),
      });
    }
    await Promise.all(nodes.map(node => dbUtils.createNode(node)));

    for(let i = 0; i < 3; i++) {
      const userPoktAccount = await createPoktAccount();
      const now = dayjs().toISOString();
      const salt = generateSalt();
      const user: Account = {
        id: generateId(),
        email: `${generateId()}@email.com`,
        salt,
        passwordHash: hashPassword(generateId(), salt),
        domains: `${generateId()}.com`,
        poktAddress: userPoktAccount.address,
        chainSalt: generateSalt(),
        isPartner: false,
        agreeTos: true,
        agreeTosDate: now,
        agreePrivacyPolicy: true,
        agreePrivacyPolicyDate: now,
        agreeCookies: true,
        agreeCookiesDate: now,
        chains: [],
      };
      const userChains = [];
      for(let i = 0; i < rpcEndpoints.length; i++) {
        user.chains.push({
          id: rpcEndpoints[i].chainId,
          host: `${generateId()}.test.com`,
        });
      }
      users.push(user);
    }

    await Promise.all(users.map((user) => dbUtils.createAccount(user)));

  });

  describe('.postProviderUnlock()', function() {

    const key = generateId();
    let provider: Provider;
    let sessionToken: SessionToken;

    before(async function() {
      const keySalt = generateSalt();
      provider = {
        id: generateId(),
        name: 'Another Test Provider',
        email: `${generateId()}@test.com`,
        keyHash: hashPassword(key, keySalt),
        keySalt,
        poktAddress: generateId(),
        agreeTos: true,
        agreeTosDate: new Date().toISOString(),
        agreePrivacyPolicy: true,
        agreePrivacyPolicyDate: new Date().toISOString(),
      };
      await dbUtils.createProvider(provider);
    });

    it('should generate a new session token for a valid provider', async function() {
      { // Bad body
        const badBodies = [
          2,
          "2",
          undefined,
          JSON.stringify({}),
          JSON.stringify({key: ''}),
          JSON.stringify({key: '        '}),
        ];
        for(const body of badBodies) {
          // @ts-ignore
          const res = await providersHandler.postProviderUnlock({resource: '', httpMethod: '', body});
          res.should.be.an.Object();
          res.statusCode.should.equal(400);
          res.body.should.be.a.String();
        }
      }
      { // Bad providerId
        const body: ProviderUnlockPostBody = {
          key,
        };
        // @ts-ignore
        const res = await providersHandler.postProviderUnlock({
          resource: '',
          httpMethod: '',
          body: JSON.stringify(body),
          pathParameters: {
            providerid: 'badproviderid',
          },
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(401);
        res.body.should.be.a.String();
      }
      { // Bad key
        const body: ProviderUnlockPostBody = {
          key: 'badkey',
        };
        // @ts-ignore
        const res = await providersHandler.postProviderUnlock({
          resource: '',
          httpMethod: '',
          body: JSON.stringify(body),
          pathParameters: {
            providerid: provider.id,
          },
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(401);
        res.body.should.be.a.String();
      }
      { // Good credentials
        const body: ProviderUnlockPostBody = {
          key,
        };
        // @ts-ignore
        const res = await providersHandler.postProviderUnlock({
          resource: '',
          httpMethod: '',
          body: JSON.stringify(body),
          pathParameters: {
            providerid: provider.id,
          },
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        sessionToken = JSON.parse(res.body);
        sessionToken.should.be.an.Object();
        sessionToken.token.should.be.a.String();
        sessionToken.user.should.equal(provider.id)
        sessionToken.expiration.should.be.a.String();
        dayjs(sessionToken.expiration).isAfter(dayjs()).should.be.True();
      }
    });

    after(async function() {
      await dbUtils.deleteSessionToken(sessionToken.token);
      await dbUtils.deleteProvider(provider.id);
    });

  });

  describe('.getProvider()', function() {
    it('should get a provider', async function() {
      { // Good user
        // @ts-ignore
        const res = await providersHandler.getProvider({
          resource: '',
          httpMethod: '',
          pathParameters: {providerid: provider.id},
          headers: {'x-api-key': sessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.id.should.equal(provider.id);
        parsed.email.should.equal(provider.email);
        parsed.poktAddress.should.equal(provider.poktAddress);
      }
    });
  });

  describe('.getProviderGateways()', function() {
    it('should get a provider\'s gateways', async function() {
      { // Good user
        // @ts-ignore
        const res = await providersHandler.getProviderGateways({
          resource: '',
          httpMethod: '',
          pathParameters: {providerid: provider.id},
          headers: {'x-api-key': sessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.should.be.an.Array();
        parsed.length.should.equal(gateways.length);
        for(const gateway of parsed) {
          const found = gateways.find(g => g.id === gateway.id);
          should.exist(found);
          if(!found)
            return;
          gateway.id.should.equal(found.id);
          gateway.region.should.equal(found.region);
          gateway.provider.should.equal(found.provider);
          gateway.address.should.equal(found.address);
        }
      }
    });
  });

  describe('.getProviderGateway()', function() {
    it('should get a provider gateway', async function() {
      { // Good user
        const gateway = gateways[0];
        // @ts-ignore
        const res = await providersHandler.getProviderGateway({
          resource: '',
          httpMethod: '',
          pathParameters: {
            providerid: provider.id,
            gatewayid: gateway.id,
          },
          headers: {'x-api-key': sessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.should.be.an.Object();
        parsed.id.should.equal(gateway.id);
        parsed.region.should.equal(gateway.region);
        parsed.provider.should.equal(gateway.provider);
        parsed.address.should.equal(gateway.address);
      }
    });
  });

  describe('.getProviderGatewayRpcEndpoint()', function() {
    it('should get a provider gateway\'s RPC endpoints', async function() {
      { // Good user
        const gateway = gateways[0];
        // @ts-ignore
        const res = await providersHandler.getProviderGatewayRpcEndpoints({
          resource: '',
          httpMethod: '',
          pathParameters: {
            providerid: provider.id,
            gatewayid: gateway.id,
          },
          headers: {'x-api-key': sessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        parsed.should.be.an.Array();
        parsed.length.should.equal(rpcEndpoints.length);
        for(const rpcEndpoint of parsed) {
          const found = rpcEndpoints.find(r => r.id === rpcEndpoint.id);
          should.exist(found);
          if(!found)
            return;
          rpcEndpoint.id.should.equal(found.id);
          rpcEndpoint.gateway.should.equal(found.gateway);
          rpcEndpoint.chainId.should.equal(found.chainId);
          rpcEndpoint.protocol.should.equal(found.protocol);
          rpcEndpoint.address.should.equal(found.address);
          rpcEndpoint.port.should.equal(found.port);
        }
      }
    });
  });

  describe('.getProviderGatewayHosts()', function() {
    it('should get all hosts which should be served by the gateway', async function() {
      { // Good user
        const gateway = gateways[0];
        // @ts-ignore
        const res = await providersHandler.getProviderGatewayHosts({
          resource: '',
          httpMethod: '',
          pathParameters: {
            providerid: provider.id,
            gatewayid: gateway.id,
          },
          headers: {'x-api-key': sessionToken.token}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body);
        should(parsed).be.an.Array();
        const chainIds = new Set(rpcEndpoints.map(r => r.chainId));
        parsed.length.should.equal(rpcEndpoints.length);
        const allHosts = new Set();
        for(const user of users) {
          const chains = user.chains || [];
          for(const chain of chains) {
            allHosts.add(chain.host);
          }
        }
        for(const { id, hosts } of parsed) {
          should(id).be.a.String();
          chainIds.has(id).should.be.True();
          should(hosts).be.an.Array();
          hosts.length.should.be.greaterThan(0);
          for(const host of hosts) {
            should(host).be.a.String();
            allHosts.has(host).should.be.True();
          }
        }
      }
    });
  });

  describe('.postProviderGatewayLogError', function() {
    it('should log a gateway error', async function() {
      const [ gateway ] = gateways;
      const logs = [
        'log 1',
        'log 2',
        'log 3',
      ];
      // @ts-ignore
      const res = await providersHandler.postProviderGatewayErrorLog({
        resource: '',
        httpMethod: '',
        pathParameters: {
          providerid: provider.id,
          gatewayid: gateway.id,
        },
        headers: {'x-api-key': sessionToken.token},
        body: JSON.stringify({
          logs,
        }),
      });
      res.should.be.an.Object();
      res.statusCode.should.equal(200);
      res.body.should.be.a.String();
      const parsed = JSON.parse(res.body);
      parsed.should.be.True();
    });
  });

  describe('.postProviderGatewayLogInfo', function() {
    it('should log gateway info', async function() {
      const [ gateway ] = gateways;
      const logs = [
        'log 1',
        'log 2',
        'log 3',
      ];
      // @ts-ignore
      const res = await providersHandler.postProviderGatewayInfoLog({
        resource: '',
        httpMethod: '',
        pathParameters: {
          providerid: provider.id,
          gatewayid: gateway.id,
        },
        headers: {'x-api-key': sessionToken.token},
        body: JSON.stringify({
          logs,
        }),
      });
      res.should.be.an.Object();
      res.statusCode.should.equal(200);
      res.body.should.be.a.String();
      const parsed = JSON.parse(res.body);
      parsed.should.be.True();
    });
  });

  describe('.postProviderGatewayServerNoticeLog', function() {
    it('should log a gateway server notice', async function() {
      const [ gateway ] = gateways;
      const logs = [
        'log 1',
        'log 2',
        'log 3',
      ];
      // @ts-ignore
      const res = await providersHandler.postProviderGatewayServerNoticeLog({
        resource: '',
        httpMethod: '',
        pathParameters: {
          providerid: provider.id,
          gatewayid: gateway.id,
        },
        headers: {'x-api-key': sessionToken.token},
        body: JSON.stringify({
          logs,
        }),
      });
      res.should.be.an.Object();
      res.statusCode.should.equal(200);
      res.body.should.be.a.String();
      const parsed = JSON.parse(res.body);
      parsed.should.be.True();
    });
  });

  after(async function() {
    await dbUtils.deleteSessionToken(sessionToken.token);
    await dbUtils.deleteProvider(provider.id);
    await Promise.all(gateways.map(gateway => dbUtils.deleteGateway(gateway.id)));
    await Promise.all([...rpcEndpoints, ...otherRpcEndpoints].map(rpcEndpoint => dbUtils.deleteRpcEndpoint(rpcEndpoint.id)));
    await Promise.all(nodes.map(node => dbUtils.deleteNode(node.id)));
    await Promise.all(users.map((user) => dbUtils.deleteAccount(user.id)));
  });

});
