import { DB } from '../db';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAccountFromToken, httpResponse, response403, response404 } from '../util';
import { DBUtils } from '../db-utils';
import { RouteHandler } from '../route-handler';
import bindAll from 'lodash/bindAll';

export class ChainsHandler extends RouteHandler {

  _db: DB;
  _dbUtils: DBUtils;

  constructor(db: DB) {
    super();
    this._db = db;
    this._dbUtils = new DBUtils(db);
    bindAll(this, [
      'getChains',
      'getChain',
    ]);
  }

  async getChains(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { httpMethod, pathParameters, resource } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event);
    if(errResponse)
      return errResponse;
    let chains = await this._dbUtils.getChains();
    const isPartner = account?.isPartner;
    chains = chains
      .filter((chain) => isPartner ? true : !chain.isPartnerChain)
      .filter((chain) => chain.enabled);
    return httpResponse(200, chains.map((c) => ({
      id: c.id,
      name: c.name,
    })));
  }

  async getChain(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { httpMethod, pathParameters, resource } = event;
    const [ errResponse, account ] = await getAccountFromToken(this._db, event);
    if(errResponse)
      return errResponse;
    const chains = await this._dbUtils.getChains();
    const id = pathParameters?.id;
    if(!id)
      return response404();
    const chain = await this._dbUtils.getChain(id);
    if(!chain)
      return response404();
    if((!account?.isPartner && chain.isPartnerChain) || !chain.enabled)
      return response403();
    return httpResponse(200, {
      id: chain.id,
      name: chain.name,
    });
  }

}
