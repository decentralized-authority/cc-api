import 'should';
import { CCServer } from './cc-server';
import { DB } from './db';
import { DBUtils } from './db-utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { httpResponse, timeout } from './util';

describe('CCServer', function() {

  this.timeout(30000);

  let db: DB;
  let dbUtils: DBUtils;
  const server = new CCServer();

  const route0 = '/route0';
  const route0Body = 'body0';
  const route1 = '/route1';
  const route1Body = 'body1';

  before(() => {
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
      'ccGeneralRelayLogs-test',
      'ccProviderPayments-test',
    );
    dbUtils = new DBUtils(db);
  });

  describe('.get()', function() {
    it('should register a GET request handler', async function() {
      const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
        await timeout();
        return httpResponse(200, route0Body);
      };
      const auth = false;
      const bodyStructure = {'some': 'thing'};
      server.get(route0, handler, auth, bodyStructure);
      const handlerObj = server._handlers.get(route0)?.get('GET');
      // @ts-ignore
      handlerObj?.bodyStructure.should.equal(bodyStructure);
      handlerObj?.auth.should.equal(auth);
      handlerObj?.handler.should.equal(handler);
    });
  });

  describe('.post()', function() {
    it('should register a POST request handler', async function() {
      const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
        await timeout();
        return httpResponse(200, route1Body);
      };
      const auth = true;
      const bodyStructure = {'another': 'one'};
      server.post(route1, handler, auth, bodyStructure);
      const handlerObj = server._handlers.get(route1)?.get('POST');
      // @ts-ignore
      handlerObj?.bodyStructure.should.equal(bodyStructure);
      handlerObj?.auth.should.equal(true);
      handlerObj?.handler.should.equal(handler);
    });
  });

  describe('.handle()', function() {
    it('should handle an event by calling the correct handler', async function() {
      { // route0 unknown method
        // @ts-ignore
        const res = await server.handle({
          resource: route0,
          httpMethod: 'PUT',
          pathParameters: {},
          headers: {}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(405);
        res.body.should.be.a.String();
      }
      { // route0 GET request
        // @ts-ignore
        const res = await server.handle({
          resource: route0,
          httpMethod: 'GET',
          pathParameters: {},
          headers: {}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const body = JSON.parse(res.body);
        body.should.equal(route0Body);
      }
      { // route1 unknown method
        // @ts-ignore
        const res = await server.handle({
          resource: route1,
          httpMethod: 'PUT',
          pathParameters: {},
          headers: {}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(405);
        res.body.should.be.a.String();
      }
      { // route1 POST request
        // @ts-ignore
        const res = await server.handle({
          resource: route1,
          httpMethod: 'POST',
          pathParameters: {},
          headers: {}
        });
        res.should.be.an.Object();
        res.statusCode.should.equal(200);
        res.body.should.be.a.String();
        const body = JSON.parse(res.body);
        body.should.equal(route1Body);
      }
    });
  });

  describe('unknown route', function() {
    it('should return a 404 error', async function() {
      // @ts-ignore
      const res = await server.handle({resource: 'notavalidroute', httpMethod: 'GET'});
      res.should.be.an.Object();
      res.statusCode.should.equal(404);
    });
  });

});
