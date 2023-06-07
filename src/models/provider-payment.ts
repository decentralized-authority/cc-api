import dynogels from 'dynogels';
import Joi from 'joi';

export const createProviderPaymentModel = (tableName: string) => dynogels.define('ProviderPayment', {
  hashKey: 'provider',
  rangeKey: 'date',
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    id: Joi.string(),
    // @ts-ignore
    provider: Joi.string(),
    // @ts-ignore
    invoices: Joi.array().items(Joi.string()),
    // @ts-ignore
    date: Joi.number(),
    // @ts-ignore
    total: Joi.string(),
    // @ts-ignore
    txid: Joi.string(),
    // @ts-ignore
    relays: Joi.array().items(
      Joi.object({
        chain: Joi.string(),
        relays: Joi.string(),
        percent: Joi.number(),
        reward: Joi.string(),
        breakdown: Joi.object(),
      }),
    ),
  },
});
