import dynogels from 'dynogels';
import Joi from 'joi';

export const createPoktAccountModel = (tableName: string) => dynogels.define('PoktAccount', {
  hashKey: 'address',
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    address: Joi.string(),
    // @ts-ignore
    publicKey: Joi.string(),
    // @ts-ignore
    privateKeyEncrypted: Joi.string(),
  },
});
