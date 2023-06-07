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
  httpResponse, response400, response403, splitCombinedApiKey
} from '../util';
import isPlainObject from 'lodash/isPlainObject';
import isString from 'lodash/isString';
import { SessionToken } from './root-handler';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import omit from 'lodash/omit';
import { ChainHost, GatewayHosts, GeneralRelayLog, ProviderPayment } from '../interfaces';
import winston from 'winston';
import WinstonCloudwatch from 'winston-cloudwatch';
import isArray from 'lodash/isArray';
import bindAll from 'lodash/bindAll';
import isNumber from 'lodash/isNumber';

dayjs.extend(utc);

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
  // keyHash: string
  // keySalt: string
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
export interface ProviderGeneralRelayLogsPostBody {
  startTime: number
  endTime: number
}
export interface ProviderPaymentReceiptsPostBody {
  startTime: number
  endTime: number
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
      'getProviderGatewayHosts',
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
    let { key: combinedKey } = parsed as ProviderUnlockPostBody;
    if(!isString(combinedKey))
      return httpErrorResponse(400, 'key string required');
    combinedKey = combinedKey.trim();
    if(!combinedKey)
      return httpErrorResponse(400, 'valid key required');
    // @ts-ignore
    const { providerid: providerId } = pathParameters;
    const provider = await this._dbUtils.getProvider(providerId);
    if(!provider)
      return httpErrorResponse(401, 'invalid provider credentials');
    const [ id, key ] = splitCombinedApiKey(combinedKey);
    if(!id || !key)
      return httpErrorResponse(401, 'invalid provider credentials');
    const apiKey = await this._dbUtils.getApiKey(providerId, id);
    if(!apiKey || apiKey.accountId !== providerId)
      return httpErrorResponse(401, 'invalid provider credentials');
    const keyHash = hashPassword(key, apiKey.salt);
    if(keyHash !== apiKey.hash)
      return httpErrorResponse(401, 'invalid provider credentials');
    const newToken: SessionToken = {
      token: generateId(),
      user: provider.id,
      expiration: dayjs().add(1, 'day').toISOString(),
      keyId: id,
    };
    await this._dbUtils.createSessionToken(newToken);
    return httpResponse(200, newToken);
  }

  async getProvider(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { providerid: providerId } = pathParameters;
    const [ errResponse, provider, apiKey ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse) {
      return errResponse;
    }
    if(apiKey.level === 0)
      return response403();
    return httpResponse(200, omit(provider, ['keySalt', 'keyHash']));
  }

  async getProviderGateways(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { providerid: providerId } = pathParameters;
    const [ errResponse, provider, apiKey ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateways = await this._dbUtils.getGatewaysByProvider(provider.id);
    if(apiKey.level === 0)
      return response403();
    return httpResponse(200, gateways);
  }

  async getProviderGateway(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { gatewayid: gatewayId, providerid: providerId } = pathParameters;
    const [ errResponse, provider, apiKey ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateway = await this._dbUtils.getGateway(gatewayId);
    if(!gateway)
      return httpErrorResponse(404, 'gateway not found');
    if(gateway.provider !== provider.id || apiKey.level === 0)
      return response403();
    return httpResponse(200, gateway);
  }

  async getProviderGatewayRpcEndpoints(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { gatewayid: gatewayId, providerid: providerId } = pathParameters;
    const [ errResponse, provider, apiKey ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateway = await this._dbUtils.getGateway(gatewayId);
    if(!gateway)
      return httpErrorResponse(404, 'gateway not found');
    if(gateway.provider !== provider.id || apiKey.level === 0)
      return response403();
    const rpcEndpoints = await this._dbUtils.getRpcEndpointsByGateway(gatewayId);
    return httpResponse(200, rpcEndpoints);
  }

  async getProviderGatewayHosts(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { gatewayid: gatewayId, providerid: providerId } = pathParameters;
    const [ errResponse, provider, apiKey ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateway = await this._dbUtils.getGateway(gatewayId);
    if(!gateway)
      return httpErrorResponse(404, 'gateway not found');
    if(gateway.provider !== provider.id || apiKey.level === 0 || apiKey.type !== 'GATEWAY')
      return response403();
    const rpcEndpoints = await this._dbUtils.getRpcEndpointsByGateway(gatewayId);
    const chainIds = new Set(rpcEndpoints.map(rpcEndpoint => rpcEndpoint.chainId));
    const [ nodes, accounts ] = await Promise.all([
      this._dbUtils.getNodes(),
      this._dbUtils.getAccounts(),
    ]);
    const endpoints: {[chainId: string]: string[]} = {};
    for(const account of accounts) {
      if(account.disabled)
        continue;
      // @ts-ignore
      const chains: ChainHost[] = account.chains || [];
      for(const { id, host } of chains) {
        if(chainIds.has(id)) {
          if(!endpoints[id])
            endpoints[id] = [];
          endpoints[id].push(host);
        }
      }
    }
    const gatewayHosts: GatewayHosts[] = Object.entries(endpoints)
      .map(([chainId, hosts]) => ({
        id: chainId,
        hosts: hosts,
      }));
    return httpResponse(200, gatewayHosts);
  }

  async postProviderGatewayErrorLog(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body, pathParameters } = event;
    // @ts-ignore
    const { gatewayid: gatewayId, providerid: providerId } = pathParameters;
    const [ errResponse, provider, apiKey ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateway = await this._dbUtils.getGateway(gatewayId);
    if(!gateway)
      return httpErrorResponse(404, 'gateway not found');
    if(gateway.provider !== provider.id || apiKey.level < 2 || apiKey.type !== 'GATEWAY')
      return response403();
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
    const [ errResponse, provider, apiKey ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateway = await this._dbUtils.getGateway(gatewayId);
    if(!gateway)
      return httpErrorResponse(404, 'gateway not found');
    if(gateway.provider !== provider.id || apiKey.level < 2 || apiKey.type !== 'GATEWAY')
      return response403();
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
    const [ errResponse, provider, apiKey ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse)
      return errResponse;
    const gateway = await this._dbUtils.getGateway(gatewayId);
    if(!gateway)
      return httpErrorResponse(404, 'gateway not found');
    if(gateway.provider !== provider.id || apiKey.level < 2 || apiKey.type !== 'GATEWAY')
      return response403();
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

  async postProviderGeneralRelayLogs(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body = '{}', pathParameters } = event;
    // @ts-ignore
    const { providerid: providerId } = pathParameters;
    const [ errResponse, provider, apiKey ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse) {
      return errResponse;
    }
    if(apiKey.level < 1)
      return response403();
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { startTime, endTime } = parsed as ProviderGeneralRelayLogsPostBody;
    if((startTime && !isNumber(startTime)) || (endTime && !isNumber(endTime))) {
      return response400('startTime and endTime must be numbers');
    }
    endTime = endTime || dayjs.utc().valueOf();
    startTime = startTime || dayjs.utc(endTime).subtract(7, 'day').valueOf();
    const gateways = await this._dbUtils.getGatewaysByProvider(provider.id);

    const logs = await new Promise<GeneralRelayLog[]>((resolve, reject) => {
      this._db.GeneralRelayLogs
        .scan()
        .loadAll()
        .where('gateway').in(gateways.map(g => g.id))
        .where('time').between(startTime, endTime)
        .exec((err, res) => {
          if(err) {
            reject(err);
          } else {
            const { Items } = res;
            resolve(Items.map((i: { attrs: any; }) => {
              return i.attrs;
            }));
          }
        });
    });

    return httpResponse(200, logs);
  }

  async postProviderPaymentReceipts(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const { body = '{}', pathParameters } = event;
    // @ts-ignore
    const { providerid: providerId } = pathParameters;
    const [ errResponse, provider, apiKey ] = await getProviderAccountFromToken(this._db, event, providerId);
    if(errResponse) {
      return errResponse;
    }
    if(apiKey.level < 1)
      return response403();
    if(!body || !goodBody(body, isPlainObject))
      return httpErrorResponse(400, 'Invalid body');
    const parsed = JSON.parse(body);
    let { startTime, endTime } = parsed as ProviderPaymentReceiptsPostBody;
    if((startTime && !isNumber(startTime)) || (endTime && !isNumber(endTime))) {
      return response400('startTime and endTime must be numbers');
    }
    endTime = endTime || dayjs.utc().valueOf();
    startTime = startTime || dayjs.utc(endTime).subtract(7, 'day').valueOf();

    const payments = await new Promise<ProviderPayment[]>((resolve, reject) => {
      this._dbUtils.db.ProviderPayments
        .query(provider.id)
        .where('date').between(startTime, endTime)
        .loadAll()
        .exec((err, { Items }) => {
          if(err) {
            reject(err);
          } else {
            resolve(Items.map((item: {attrs: ProviderPayment}) => item.attrs));
          }
        });
    });

    return httpResponse(200, payments);
  }

}
