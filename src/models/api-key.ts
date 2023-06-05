import dynogels from 'dynogels';
import Joi from 'joi';

export const createApiKeyModel = (tableName: string) => dynogels.define('ApiKey', {
  hashKey: 'accountId',
  rangeKey: 'id',
  tableName,
  timestamps: false,
  schema: {
    // @ts-ignore
    id: Joi.string(),
    // @ts-ignore
    accountId: Joi.string(),
    // @ts-ignore
    hash: Joi.string(),
    // @ts-ignore
    salt: Joi.string(),
    // @ts-ignore
    name: Joi.string(),
    // @ts-ignore
    type: Joi.string(), // GATEWAY or USER
    // @ts-ignore
    level: Joi.number(), // 0 - no access, 1 - read, 2 - read/write
  },
});
