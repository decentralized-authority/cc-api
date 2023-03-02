import dynogels from 'dynogels';
import Joi from 'joi';

export const createProviderModel = (tableName: string) => dynogels.define('Provider', {
  hashKey: 'id',
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    id: Joi.string(),
    // @ts-ignore
    name: Joi.string(),
    // @ts-ignore
    keyHash: Joi.string(),
    // @ts-ignore
    keySalt: Joi.string(),
    // @ts-ignore
    email: Joi.string().email(),
    // @ts-ignore
    poktAddress: Joi.string(),
    // @ts-ignore
    agreeTos: Joi.boolean(),
    // @ts-ignore
    agreeTosDate: Joi.string(),
    // @ts-ignore
    agreePrivacyPolicy: Joi.boolean(),
    // @ts-ignore
    agreePrivacyPolicyDate: Joi.string(),
  },
});
