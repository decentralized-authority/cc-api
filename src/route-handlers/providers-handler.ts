import { RouteHandler } from '../route-handler';
import { DB } from '../db';
import { DBUtils } from '../db-utils';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  generateId,
  getProviderAccountFromToken,
  goodBody,
  hashPassword,
  httpErrorResponse,
  httpResponse
} from '../util';
import isPlainObject from 'lodash/isPlainObject';
import isString from 'lodash/isString';
import { SessionToken } from './root-handler';
import dayjs from 'dayjs';
import omit from 'lodash/omit';
import { GatewayNode } from '../interfaces';
import winston from 'winston';
import WinstonCloudwatch from 'winston-cloudwatch';
import isArray from 'lodash/isArray';
import bindAll from 'lodash/bindAll';

const logger = async function(logs: string[], gateway: Gateway, logGroupName: string, isError: boolean): Promise<boolean> {
  let logger: winston.Logger;
  let cloudwatchTransport: WinstonCloudwatch;
  const success = await new Promise<boolean>((resolve) => {
    let errorCount = 0;
    cloudwatchTransport = new WinstonCloudwatch({
      awsOptions: {
        region: gateway.region,
      },
      logGroupName,
      logStreamName: () => `${dayjs().format('YYYY-MM-DD')}_${gateway.id}`,
      errorHandler: (err: any) => {
        errorCount++;
        resolve(false);
        console.error(err);
        if(errorCount === 2) {
          cloudwatchTransport.kthxbye(() => {
            // do nothing
          });
        }
      }
    });
    logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.simple(),
      ),
      transports: [
        cloudwatchTransport,
      ]
    });
    logger.on('finish', () => resolve(true));
    logs.forEach(log => {
      if(isError)
        logger.error(log);
      else
        logger.info(log)
    });
    setTimeout(() => {
      logger.end();
    }, 3000);
  });
  if(success) {
    // @ts-ignore
    cloudwatchTransport.kthxbye(() => {
      // do nothing
    });
  }
  return success;
};

export interface Gateway {
  id: string
  region: string
  provider: string
  address: string
  privateAddress: string
  statsUser: string
  statsPass: string
  httpPort: number
  apiPort: number
  statsPort: number
  controlPort: number
  serverStartingHttpPort: number
  serverStartingApiPort: number
  serverStartingStatsPort: number
  serverStartingControlPort: number
  relayPort: number
  discordWebhookUrl: string
}

export interface Provider {
  id: string
  email: string
  name: string
  keyHash: string
  keySalt: string
  poktAddress: string
  agreeTos: boolean,
  agreeTosDate: string,
  agreePrivacyPolicy: boolean,
  agreePrivacyPolicyDate: string,
}

export interface ProviderUnlockPostBody {
  key: string
}

export interface ProviderGatewayErrorLogPostBody {
  logs: string[]
}

export class ProvidersHandler extends RouteHandler {

  _db: DB;
  _dbUtils: DBUtils;

  constructor(db: DB) {
    super();
    this._db = db;
    this._dbUtils = new DBUtils(db);
    bindAll(this, [
      'postProviderUnlock',
      'getProvider',
      'getProviderGateways',
      'getProviderGateway',
      'getProviderGatewayRpcEndpoints',
      'getProviderGatewayNodes',
      'postProviderGatewayErrorLog',
      'postProviderGatewayInfoLog',
      'postProviderGatewayServerNoticeLog',
    ]);
  }

  async postProviderUnlock(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { key } = parsed as ProviderUnlockPostBody;
    if(!isString(key))
      return httpErrorResponse(400, 'key string required');
    key = key.trim();
    if(!key)
      return httpErrorResponse(400, 'valid key required');
    // @ts-ignore
    const { providerid: providerId } = pathParameters;
    const provider = await this._dbUtils.getProvider(providerId);
    if(!provider)
      return httpErrorResponse(401, 'invalid provider credentials');
    const keyHash = hashPassword(key, provider.keySalt);
    if(keyHash !== provider.keyHash)
      return httpErrorResponse(401, 'invalid provider credentials');
    const newToken: SessionToken = {
      token: generateId(),
      user: provider.id,
      expiration: dayjs().add(1, 'day').toISOString(),
    };
    await this._dbUtils.createSessionToken(newToken);
    return httpResponse(200, newToken);
  }

  async getProvider(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { providerid: providerId } = pathParameters;
    const [ errResponse, provider ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    else
      return httpResponse(200, omit(provider, ['keySalt', 'keyHash']));
  }

  async getProviderGateways(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { providerid: providerId } = pathParameters;
    const [ errResponse, provider ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateways = await this._dbUtils.getGatewaysByProvider(provider.id);
    return httpResponse(200, gateways);
  }

  async getProviderGateway(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { gatewayid: gatewayId, providerid: providerId } = pathParameters;
    const [ errResponse, provider ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateway = await this._dbUtils.getGateway(gatewayId);
    if(!gateway)
      return httpErrorResponse(404, 'gateway not found');
    if(gateway.provider !== provider.id)
      return httpErrorResponse(403, 'Forbidden');
    return httpResponse(200, gateway);
  }

  async getProviderGatewayRpcEndpoints(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { gatewayid: gatewayId, providerid: providerId } = pathParameters;
    const [ errResponse, provider ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateway = await this._dbUtils.getGateway(gatewayId);
    if(!gateway)
      return httpErrorResponse(404, 'gateway not found');
    if(gateway.provider !== provider.id)
      return httpErrorResponse(403, 'Forbidden');
    const rpcEndpoints = await this._dbUtils.getRpcEndpointsByGateway(gatewayId);
    return httpResponse(200, rpcEndpoints);
  }

  async getProviderGatewayNodes(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { gatewayid: gatewayId, providerid: providerId } = pathParameters;
    const [ errResponse, provider ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateway = await this._dbUtils.getGateway(gatewayId);
    if(!gateway)
      return httpErrorResponse(404, 'gateway not found');
    if(gateway.provider !== provider.id)
      return httpErrorResponse(403, 'Forbidden');
    const rpcEndpoints = await this._dbUtils.getRpcEndpointsByGateway(gatewayId);
    const chainIds = new Set(rpcEndpoints.map(rpcEndpoint => rpcEndpoint.chainId));
    const nodes = await this._dbUtils.getNodes();
    const filteredNodes: GatewayNode[] = nodes
      .filter(node => node.chains.some(chain => chainIds.has(chain.id)))
      .map(node => ({
        id: node.id,
        chains: node.chains
          .filter(chain => chainIds.has(chain.id)),
      }));
    return httpResponse(200, filteredNodes);
  }

  async postProviderGatewayErrorLog(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { gatewayid: gatewayId, providerid: providerId } = pathParameters;
    const [ errResponse, provider ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateway = await this._dbUtils.getGateway(gatewayId);
    if(!gateway)
      return httpErrorResponse(404, 'gateway not found');
    if(gateway.provider !== provider.id)
      return httpErrorResponse(403, 'Forbidden');
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { logs } = parsed as ProviderGatewayErrorLogPostBody;
    if(!isArray(logs))
      return httpErrorResponse(400, 'logs array required');
    const preppedLogs: string[] = [];
    for(const log of logs) {
      if(!log || !isString(log) || !log.trim())
        return httpErrorResponse(400, 'each log must be a string');
      preppedLogs.push(log.trim());
    }
    if(!process.env.CC_GATEWAY_ERROR_LOG_GROUP_NAME)
      return httpErrorResponse(500, 'CC_GATEWAY_ERROR_LOG_GROUP_NAME not set');
    const success = await logger(preppedLogs, gateway, process.env.CC_GATEWAY_ERROR_LOG_GROUP_NAME, true);
    return httpResponse(200, success);
  }

  async postProviderGatewayInfoLog(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { gatewayid: gatewayId, providerid: providerId } = pathParameters;
    const [ errResponse, provider ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateway = await this._dbUtils.getGateway(gatewayId);
    if(!gateway)
      return httpErrorResponse(404, 'gateway not found');
    if(gateway.provider !== provider.id)
      return httpErrorResponse(403, 'Forbidden');
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { logs } = parsed as ProviderGatewayErrorLogPostBody;
    if(!isArray(logs))
      return httpErrorResponse(400, 'logs array required');
    const preppedLogs: string[] = [];
    for(const log of logs) {
      if(!log || !isString(log) || !log.trim())
        return httpErrorResponse(400, 'each log must be a string');
      preppedLogs.push(log.trim());
    }
    if(!process.env.CC_GATEWAY_INFO_LOG_GROUP_NAME)
      return httpErrorResponse(500, 'CC_GATEWAY_INFO_LOG_GROUP_NAME not set');
    const success = await logger(preppedLogs, gateway, process.env.CC_GATEWAY_INFO_LOG_GROUP_NAME, false);
    return httpResponse(200, success);
  }

  async postProviderGatewayServerNoticeLog(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { gatewayid: gatewayId, providerid: providerId } = pathParameters;
    const [ errResponse, provider ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateway = await this._dbUtils.getGateway(gatewayId);
    if(!gateway)
      return httpErrorResponse(404, 'gateway not found');
    if(gateway.provider !== provider.id)
      return httpErrorResponse(403, 'Forbidden');
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { logs } = parsed as ProviderGatewayErrorLogPostBody;
    if(!isArray(logs))
      return httpErrorResponse(400, 'logs array required');
    const preppedLogs: string[] = [];
    for(const log of logs) {
      if(!log || !isString(log) || !log.trim())
        return httpErrorResponse(400, 'each log must be a string');
      preppedLogs.push(log.trim());
    }
    if(!process.env.CC_GATEWAY_SERVER_NOTICE_LOG_GROUP_NAME)
      return httpErrorResponse(500, 'CC_GATEWAY_ERROR_SERVER_NOTICE_LOG_GROUP_NAME not set');
    const success = await logger(preppedLogs, gateway, process.env.CC_GATEWAY_SERVER_NOTICE_LOG_GROUP_NAME, false);
    return httpResponse(200, success);
  }

}
