import dynogels from 'dynogels';
import Joi from 'joi';

export const createChainModel = (tableName: string) => dynogels.define('Chain', {
  hashKey: 'id',
  tableName,
  timestamps: false,
  schema: {
    // @ts-ignore
    id: Joi.string(),
    // @ts-ignore
    name: Joi.string(),
    // @ts-ignore
    portalPrefix: Joi.string(),
    // @ts-ignore
    ticker: Joi.string(),
    // @ts-ignore
    description: Joi.string(),
    // @ts-ignore
    blockchain: Joi.string(),
    // @ts-ignore
    allowance: Joi.number(),
    // @ts-ignore
    authRpcEndpoint: Joi.string(),
    // @ts-ignore
    enabled: Joi.boolean(),
    // @ts-ignore
    isPartnerChain: Joi.boolean(),
    // @ts-ignore
    billing: Joi.array().items(Joi.object({
      date: Joi.number(),
      perc: Joi.number(),
    })),
  },
});
