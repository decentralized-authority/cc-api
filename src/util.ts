import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import isString from 'lodash/isString';
import crypto, { Encoding } from 'crypto';
import Sodium from 'libsodium-wrappers';
import { DB } from './db';
import dayjs from 'dayjs';
import { DEFAULT_TIMEOUT, SESSION_TOKEN_HEADER } from './constants';
import { Account } from './route-handlers/accounts-handler';
import request from 'superagent';
import { SessionToken } from './route-handlers/root-handler';
import { Gateway, Provider } from './route-handlers/providers-handler';
import { DBUtils } from './db-utils';
import { ApiKey } from './interfaces';

export const timeout = (length = 0) => new Promise(resolve => setTimeout(resolve, length));

export const httpErrorResponse = (statusCode: number, message = ''): APIGatewayProxyResult => ({
  statusCode,
  body: JSON.stringify(message),
  headers: {
    'Access-Control-Allow-Origin': '*'
  },
});

export const response400 = (message = 'Invalid body'): APIGatewayProxyResult => {
  return httpErrorResponse(400, message);
};
export const response401 = (message = 'Unauthorized'): APIGatewayProxyResult => {
  return httpErrorResponse(401, message);
};
export const response403 = (message = 'Forbidden'): APIGatewayProxyResult => {
  return httpErrorResponse(403, message);
};
export const response404 = (message = 'Not Found'): APIGatewayProxyResult => {
  return httpErrorResponse(404, message);
};
export const response405 = (message = 'Method not allowed'): APIGatewayProxyResult => {
  return httpErrorResponse(405, message);
};

export const httpResponse = (statusCode: number, body: any): APIGatewayProxyResult => ({
  statusCode,
  body: JSON.stringify(body, null, 2),
  headers: {
    'Access-Control-Allow-Origin': '*'
  },
});

export const goodBody = (body: any, typeFunc?: any): boolean => {
  try {
    const parsed = JSON.parse(body);
    if(typeFunc)
      return typeFunc(parsed);
    else
      return true;
  } catch(err) {
    // ignore error
    return false;
  }
};

export const goodEmail = (email = ''): boolean => /^.+@.+\..+$/.test(email);

export const goodPassword = (password: string) => {
  if(!isString(password))
    return false;
  return !!password.trim() && password.length >= 12;
};

export const generateId = (): string => {
  return crypto.randomBytes(16)
    .toString('hex');
};

export const generateSalt = (size = 16): string => {
  return crypto.randomBytes(size)
    .toString('hex');
};

export const hashPassword = (password: string, salt: string): string => {
  return crypto
    .pbkdf2Sync(password, salt, 150000, 256, 'sha512')
    .toString('hex');
};

export const sha256 = (str: string, inputEncoding: Encoding): string => {
  const hash = crypto.createHash('sha256');
  hash.update(str, inputEncoding);
  return hash.digest('hex');
};

export const poktAddressFromPublicKey = (publicKey: string): string => {
  return sha256(publicKey, 'hex').slice(0, 40);
};

export const createPoktAccount = async (): Promise<{privateKey: string, publicKey: string, address: string}> => {
  await Sodium.ready;
  const keypair = Sodium.crypto_sign_keypair();
  const privateKey = Buffer.from(keypair.privateKey).toString('hex');
  const publicKey = Buffer.from(keypair.publicKey).toString('hex');
  const address = poktAddressFromPublicKey(publicKey);
  return {
    privateKey,
    publicKey,
    address,
  };
};

export const isValidSessionToken = async (db: DB, token: string): Promise<SessionToken|null> => {
  const sessionToken: SessionToken|null = await new Promise<any>((resolve, reject) => {
    db.SessionTokens.get(token, (err, item) => {
      if(err) {
        reject(err);
      } else {
        // @ts-ignore
        resolve(item ? item.attrs : null);
      }
    });
  });
  if(!sessionToken || dayjs(sessionToken.expiration).isBefore(dayjs()))
    return null;
  return sessionToken;
};

export const getAccountFromToken = async (db: DB, event: APIGatewayProxyEvent, id?: string): Promise<[APIGatewayProxyResult, null]|[null, Account]> => {
  const dbUtils = new DBUtils(db);
  const token = event.headers[SESSION_TOKEN_HEADER];
  if(!token)
    return [response403('Missing x-api-key header.'), null];
  const sessionToken = await isValidSessionToken(db, token);
  if(!sessionToken || (isString(id) && sessionToken.user !== id))
    return [response403('Invalid session token'), null];
  const account = await dbUtils.getAccount(sessionToken.user);
  if(!account)
    return [response404(), null];
  return [null, account];
}

export const getProviderAccountFromToken = async (db: DB, event: APIGatewayProxyEvent, id?: string): Promise<[APIGatewayProxyResult, null]|[null, Provider, ApiKey]> => {
  const token = event.headers[SESSION_TOKEN_HEADER];
  if(!token)
    return [response403('Missing x-api-key header.'), null];
  const sessionToken = await isValidSessionToken(db, token);
  if(!sessionToken || (isString(id) && sessionToken.user !== id))
    return [response403('Invalid session token'), null];
  const provider: Provider|null = await new Promise<any>((resolve, reject) => {
    db.Providers.get(sessionToken.user, (err, item) => {
      if(err) {
        reject(err);
      } else {
        // @ts-ignore
        resolve(item ? item.attrs : null);
      }
    });
  });
  if(!provider)
    return [response404(), null];
  const dbUtils = new DBUtils(db);
  if(!sessionToken.keyId)
    return [response403(), null];
  const apiKey = await dbUtils.getApiKey(provider.id, sessionToken.keyId);
  if(!apiKey)
    return [response403(), null];
  return [null, provider, apiKey];
}

export const checkRecaptcha = async function(recaptchaSecret: string, recaptchaToken: string): Promise<boolean> {
  const { body } = await request
    .post('https://www.google.com/recaptcha/api/siteverify')
    .timeout(DEFAULT_TIMEOUT)
    .type('application/x-www-form-urlencoded')
    .send(`secret=${recaptchaSecret}&response=${recaptchaToken}`);
  return body.success;
};

export const addressPatt = /^[0123456789abcdef]{40}$/i;

export const generateChainUrl = (account: Account, chainId: string): string => {
  chainId = chainId.toLowerCase();
  const hash = sha256(account.id + account.chainSalt + chainId, 'utf8');
  return `${hash.slice(0, 16)}.${chainId}.${process.env.CC_CHAINS_DOMAIN}`;
};

export const generateGateway = (providerId: string, region: string, address: string, privateAddress: string, discordWebhookUrl: string): Gateway => ({
  id: generateId(),
  region,
  provider: providerId,
  address,
  privateAddress,
  statsUser: 'statsUser',
  statsPass: generateId(),
  httpPort: 39880,
  serverStartingHttpPort: 8080,
  apiPort: 3900,
  serverStartingApiPort: 3901,
  statsPort: 3200,
  serverStartingStatsPort: 3201,
  controlPort: 30000,
  serverStartingControlPort: 30001,
  relayPort: 29999,
  discordWebhookUrl,
});

export const goodDomain = (domain: string): boolean => {
  return /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/.test(domain);
};

export const combinedKeySeparator = '-';
export const combinedKeyIdLength = 8;
export const combinedKeyPatt = new RegExp(`^(\\w{${combinedKeyIdLength}})${combinedKeySeparator}(\\w+)$`);

export const generateCombinedApiKey = (key: string): string => {
  return `${generateId().slice(0, combinedKeyIdLength)}${combinedKeySeparator}${key}`;
};

export const splitCombinedApiKey = (combinedKey: string): string[] => {
  const matches = combinedKey.match(combinedKeyPatt);
  if(!matches)
    return [];
  return [matches[1], matches[2]];
};
