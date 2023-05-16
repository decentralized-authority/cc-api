import { DB } from '../db';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAccountFromToken, httpResponse, response403, response404 } from '../util';
import { DBUtils } from '../db-utils';
import { RouteHandler } from '../route-handler';
import bindAll from 'lodash/bindAll';
import uniq from 'lodash/uniq';
import { Gateway } from './providers-handler';
import { RpcEndpoint } from '../interfaces';

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

  private async generateProvidersByRegion(chainId?: string) {
    let gateways: Gateway[];
    let rpcEndpoints: RpcEndpoint[];
    if(chainId) {
      const res = await Promise.all([
        this._dbUtils.getGatewaysLimited(['id', 'region']),
        this._dbUtils.getRpcEndpointsByChainLimited(chainId, ['id', 'chainId', 'gateway']),
      ]);
      gateways = res[0];
      rpcEndpoints = res[1];
    } else {
      const res = await Promise.all([
        this._dbUtils.getGatewaysLimited(['id', 'region']),
        this._dbUtils.getRpcEndpointsLimited(['id', 'chainId', 'gateway']),
      ]);
      gateways = res[0];
      rpcEndpoints = res[1];
    }
    return rpcEndpoints.reduce((acc, rpcEndpoint) => {
      if(!acc[rpcEndpoint.chainId])
        acc[rpcEndpoint.chainId] = {};
      const gateway = gateways.find((g) => g.id === rpcEndpoint.gateway);
      if(!gateway)
        return acc;
      if(!acc[rpcEndpoint.chainId][gateway.region])
        acc[rpcEndpoint.chainId][gateway.region] = 0;
      acc[rpcEndpoint.chainId][gateway.region]++;
      return acc;
    }, {} as {[chainId: string]: {[region: string]: number}});
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
    const providersByRegion = await this.generateProvidersByRegion();
    return httpResponse(200, chains
      .map((c) => ({
        id: c.id,
        name: c.name,
        providers: providersByRegion[c.id] || {},
      }))
      .sort((a, b) => a.id.localeCompare(b.id)));
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
    const providersByRegion = await this.generateProvidersByRegion(id);
    return httpResponse(200, {
      id: chain.id,
      name: chain.name,
      providers: providersByRegion[id] || {},
    });
  }

}
