import { DB } from '../db';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  addressPatt,
  generateId,
  getAccountFromToken,
  goodBody,
  httpErrorResponse,
  httpResponse
} from '../util';
import { Node } from '../interfaces';
import isPlainObject from 'lodash/isPlainObject';
import isString from 'lodash/isString';
import { DBUtils } from '../db-utils';
import isArray from 'lodash/isArray';
import { RouteHandler } from '../route-handler';
import bindAll from 'lodash/bindAll';
import { PoktUtils } from '../pokt-utils';

export interface NodesPostBody {
  address: string
}

export class NodesHandler extends RouteHandler {

  _db: DB;
  _dbUtils: DBUtils;
  _poktUtils: PoktUtils;

  constructor(db: DB, poktUtils: PoktUtils) {
    super();
    this._db = db;
    this._dbUtils = new DBUtils(db);
    this._poktUtils = poktUtils;
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
    const prevNode = await this._dbUtils.getNodeByAddress(address, account.id);
    if(prevNode)
      return httpErrorResponse(400, 'Address already registered.');

    if(process.env.NODE_ENV !== 'development') {
      const queryNodeData = await this._poktUtils.getNode(address);
      if(!queryNodeData)
        return httpErrorResponse(400, `${address} must be a staked POKT node.`);
    }

    const node: Node = {
      id: generateId(),
      address,
      user: account.id,
    };
    await this._dbUtils.createNode(node);
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
    return httpResponse(200, true);
  }

}
