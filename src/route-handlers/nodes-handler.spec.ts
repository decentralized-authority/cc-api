import 'should';
import { routes } from '../constants';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DB } from '../db';
import { createPoktAccount, generateId, generateSalt, hashPassword } from '../util';
import dayjs from 'dayjs';
import { Account } from './accounts-handler';
import { Node } from '../interfaces';
import { DBUtils } from '../db-utils';
import { NodesHandler } from './nodes-handler';
import { SessionToken } from './root-handler';
import { PoktUtils } from '../pokt-utils';

describe('NodesHandler', function() {

  this.timeout(30000);

  let nodesHandler: NodesHandler;
  let db: DB;
  let dbUtils: DBUtils;
  let account: Account;
  let goodSessionToken: SessionToken;
  let expiredSessionToken: SessionToken;
  let node0: Node;
  let node1: Node;
  let node2: Node;

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
    );
    await db.initialize();
    dbUtils = new DBUtils(db);
    nodesHandler = new NodesHandler(db, new PoktUtils(process.env.POKT_ENDPOINT || ''));
    const poktAccount = await createPoktAccount();
    const now = dayjs().toISOString();
    const salt = generateSalt();
    account = {
      id: generateId(),
      email: `${generateId()}@email.com`,
      salt,
      passwordHash: hashPassword(generateId(), salt),
      domains: `${generateId()}.com`,
      poktAddress: poktAccount.address,
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
    const poktAccount0 = await createPoktAccount();
    node0 = {
      id: generateId(),
      address: poktAccount0.address,
      user: account.id,
    };
    const poktAccount1 = await createPoktAccount();
    node1 = {
      id: generateId(),
      address: poktAccount1.address,
      user: account.id,
    };
    const poktAccount2 = await createPoktAccount();
    node2 = {
      id: generateId(),
      address: poktAccount2.address,
      user: account.id,
    };
    await Promise.all([node0, node1, node2].map(n => dbUtils.createNode(n)));
  });

  const runTokenTests = async function(handler: (event: APIGatewayProxyEvent)=>Promise<APIGatewayProxyResult>) {
    { // No token
      // @ts-ignore
      const res = await handler({
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
      const res = await handler({
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
      const res = await handler({
        resource: '',
        httpMethod: '',
        pathParameters: {},
        headers: {'x-api-key': '12345'},
      });
      res.should.be.an.Object();
      res.statusCode.should.equal(403);
      res.body.should.be.a.String();
    }
  };

  describe('.getNodes()', function() {
    it('should get all of the user\'s nodes', async function() {
      await runTokenTests(nodesHandler.getNodes);
      { // Good token
        // @ts-ignore
        const res = await nodesHandler.getNodes({
          resource: '',
          httpMethod: '',
          pathParameters: {},
          headers: {'x-api-key': goodSessionToken.token},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const parsed = JSON.parse(res.body) as Node[];
        parsed.should.be.an.Array();
        for(const node of parsed) {
          [node0.address, node1.address, node2.address].some(a => a === node.address).should.be.True();
          node.user.should.equal(account.id);
        }
      }
    });
  });

  describe('.postNodes()', function() {

    let newNode: Node;

    it('should add a node', async function() {
      await runTokenTests(nodesHandler.postNodes);
      { // Bad bodies
        const badBodies = [
          undefined,
          2,
          JSON.stringify('something'),
          JSON.stringify({address: undefined}),
          JSON.stringify({address: 2}),
          JSON.stringify({address: '1234'}),
          JSON.stringify({address: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'}),
          JSON.stringify({address: node0.address}),
        ];
        for(const body of badBodies) {
          // @ts-ignore
          const res = await nodesHandler.postNodes({resource: '', httpMethod: '', pathParameters: {}, body, headers: {'x-api-key': goodSessionToken.token}});
          res.should.be.an.Object();
          res.statusCode.should.equal(400);
          res.body.should.be.a.String();
        }
      }
      { // Good token
        const { address } = await createPoktAccount();
        // @ts-ignore
        const res = await nodesHandler.postNodes({
          resource: routes.NODES,
          httpMethod: 'POST',
          pathParameters: {},
          body: JSON.stringify({address}),
          headers: {'x-api-key': goodSessionToken.token},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        newNode = JSON.parse(res.body);
        newNode.address.should.equal(address);
        newNode.user.should.equal(account.id);
      }
    });

    after(async function() {
      if(newNode)
        await dbUtils.deleteNode(newNode.id);
    });
  });

  describe('.getNode()', function() {
    it('should get a node', async function() {
      await runTokenTests(nodesHandler.getNode);
      {// Not found
        // @ts-ignore
        const res = await nodesHandler.getNode({
          resource: '',
          httpMethod: '',
          pathParameters: {address: 'somenonexistentnode'},
          headers: {'x-api-key': goodSessionToken.token},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(404);
        res.body.should.be.a.String();
      }
      {// good token
        // @ts-ignore
        const res = await nodesHandler.getNode({
          resource: '',
          httpMethod: '',
          pathParameters: {address: node1.address},
          headers: {'x-api-key': goodSessionToken.token},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const node = JSON.parse(res.body) as Node;
        node.should.be.an.Object();
        node.address.should.equal(node1.address);
        node.user.should.equal(account.id);
      }
    });
  });

  describe('.postNodeDelete()', function() {

    let nodeToDelete: Node;

    before(async function() {
      const poktAccount = await createPoktAccount();
      nodeToDelete = {
        id: generateId(),
        address: poktAccount.address,
        user: account.id,
      };
      await dbUtils.createNode(nodeToDelete);
    });

    it('should delete a node', async function() {
      await runTokenTests(nodesHandler.postNodeDelete);
      {// Not found
        // @ts-ignore
        const res = await nodesHandler.postNodeDelete({
          resource: '',
          httpMethod: '',
          pathParameters: {address: 'somenonexistentnode'},
          headers: {'x-api-key': goodSessionToken.token},
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(404);
        res.body.should.be.a.String();
      }
      {// good token
        // @ts-ignore
        const res = await nodesHandler.postNodeDelete({
          resource: '',
          httpMethod: '',
          pathParameters: {address: nodeToDelete.address},
          headers: {'x-api-key': goodSessionToken.token},
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
    await Promise.all([node0, node1, node2].map(n => dbUtils.deleteNode(n.id)));
  });

});
