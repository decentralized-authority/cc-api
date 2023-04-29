import dynogels from 'dynogels';
import Joi from 'joi';

export const createRelayInvoiceModel = (tableName: string) => dynogels.define('RelayInvoice', {
  hashKey: 'id',
  indexes: [
    {name: 'user-date-index', hashKey: 'user', rangeKey: 'date', type: 'global'},
  ],
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    id: Joi.string(),
    // @ts-ignore
    user: Joi.string(),
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
        sessionRelays: Joi.string(),
        sessionRewards: Joi.string(),
        relays: Joi.string(),
        rewardsPerc: Joi.number(),
        rewardsAmt: Joi.string(),
      }),
    ),
  },
});
