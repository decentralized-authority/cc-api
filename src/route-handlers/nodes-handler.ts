import { DB } from '../db';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  addressPatt,
  generateId,
  getAccountFromToken,
  goodBody,
  httpErrorResponse,
  httpResponse, sha256
} from '../util';
import { DeletedNode, Node, RoutingTablesChange } from '../interfaces';
import isPlainObject from 'lodash/isPlainObject';
import isString from 'lodash/isString';
import { DBUtils } from '../db-utils';
import isArray from 'lodash/isArray';
import { RouteHandler } from '../route-handler';
import bindAll from 'lodash/bindAll';
import { PoktUtils } from '../pokt-utils';
import escapeRegExp from 'lodash/escapeRegExp';
import dayjs from 'dayjs';
import { routingChangeType } from '../constants';
import { QueueManager } from '../queue-manager';

export interface NodesPostBody {
  address: string
}

export class NodesHandler extends RouteHandler {

  _db: DB;
  _dbUtils: DBUtils;
  _poktUtils: PoktUtils;
  _nodeDeleteTimeout: number;
  _qm: QueueManager;

  constructor(db: DB, poktUtils: PoktUtils, nodeDeleteTimeout: number, qm: QueueManager) {
    super();
    this._db = db;
    this._dbUtils = new DBUtils(db);
    this._poktUtils = poktUtils;
    this._nodeDeleteTimeout = nodeDeleteTimeout;
    this._qm = qm;
    bindAll(this, [
      'getNodes',
      'postNodes',
      'getNode',
      'postNodeDelete',
    ]);
  }

  async getNodes(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const [ errResponse, account ] = await getAccountFromToken(this._db, event);
    if(errResponse)
      return errResponse;
    const nodes = await this._dbUtils.getNodesByUser(account.id);
    return httpResponse(200, nodes);
  }

  async postNodes(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event);
    if(errResponse)
      return errResponse;
    if(account.isPartner)
      return httpErrorResponse(403, 'Partners cannot register nodes via the API at this time.');
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { address } = parsed as NodesPostBody;
    if(!isString(address) || !addressPatt.test(address))
      return httpErrorResponse(400, 'Invalid POKT address');
    address = address.toLowerCase();
    const [ prevNode, deletedNodes ]: [Node|null, DeletedNode[]] = await Promise.all([
      this._dbUtils.getNodeByAddress(address, account.id),
      this._dbUtils.getDeletedNodesByHashedAddress(sha256(address, 'utf8')),
    ]);
    if(prevNode)
      return httpErrorResponse(400, 'Address already registered.');
    if(deletedNodes.length > 0) {
      const recent = deletedNodes
        .find((d) => dayjs().isBefore(dayjs(d.deletedAt).add(this._nodeDeleteTimeout, 'hours')));
      if(recent)
        return httpErrorResponse(400, `Node with address ${address} was recently deleted. You will need to wait util ${dayjs(recent.deletedAt).add(this._nodeDeleteTimeout, 'hours').toISOString()} before you can register it again.`);
    }
    if(process.env.NODE_ENV !== 'development') {
      const queryNodeData = await this._poktUtils.getNode(address);
      if(!queryNodeData)
        return httpErrorResponse(400, `${address} must be a staked POKT node.`);
      let { service_url: serviceUrl } = queryNodeData;
      if(!serviceUrl)
        return httpErrorResponse(500, `Unable to get node's service url.`);
      serviceUrl = serviceUrl
        .toLowerCase()
        .replace(/\/$/, '')
        .replace(/:\d+$/, '');
      const domainPatts = account.domains
        .map((d) => new RegExp(`[./]${escapeRegExp(d)}$`));
      const domainMatches = domainPatts.some((p) => p.test(serviceUrl));
      if(!domainMatches)
        return httpErrorResponse(400, `The node's service url must match or be a subdomain of one of the top level domains registered to your account.`);
    }

    const node: Node = {
      id: generateId(),
      address,
      user: account.id,
    };
    await this._dbUtils.createNode(node);
    if(process.env.NODE_ENV !== 'development') {
      const changeParams: RoutingTablesChange = {
        user: account.id,
        type: routingChangeType.ADD_NODE,
        chains: [],
      };
      await this._qm.routingTablesChange.sendMessage(changeParams);
    }
    return httpResponse(200, node);
  }

  async getNode(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event);
    if(errResponse)
      return errResponse;
    // @ts-ignore
    const { address } = pathParameters;
    const node = await this._dbUtils.getNodeByAddress(address, account.id);
    if(!node)
      return httpErrorResponse(404, 'Not found');
    return httpResponse(200, node);
  }

  async postNodeDelete(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { pathParameters } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event);
    if(errResponse)
      return errResponse;
    if(account.isPartner)
      return httpErrorResponse(403, 'Partners cannot delete nodes via the API at this time.');
    // @ts-ignore
    const { address } = pathParameters;
    const node = await this._dbUtils.getNodeByAddress(address, account.id);
    if(!node)
      return httpErrorResponse(404, 'Not found');
    await this._dbUtils.deleteNode(node.id);
    if(process.env.NODE_ENV !== 'development') {
      const changeParams: RoutingTablesChange = {
        user: account.id,
        type: routingChangeType.DELETE_NODE,
        chains: [],
      };
      await this._qm.routingTablesChange.sendMessage(changeParams);
    }
    return httpResponse(200, true);
  }

}
