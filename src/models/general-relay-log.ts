import dynogels from 'dynogels';
import Joi from 'joi';

export const createGeneralRelayLogModel = (tableName: string) => dynogels.define('GeneralRelayLog', {
  hashKey: 'gateway',
  rangeKey: 'time',
  indexes: [],
  tableName,
  timestamps: false,
  schema: {
    // @ts-ignore
    gateway: Joi.string(),
    // @ts-ignore
    time: Joi.number(),
    // @ts-ignore
    start: Joi.number(),
    // @ts-ignore
    end: Joi.number(),
    // @ts-ignore
    relays: Joi.object(),
  },
});
