import dynogels from 'dynogels';
import Joi from 'joi';

export const createInvitationModel = (tableName: string) => dynogels.define('Invitation', {
  hashKey: 'id',
  tableName,
  timestamps: true,
  schema: {
    // @ts-ignore
    id: Joi.string(),
    // @ts-ignore
    expiration: Joi.string(),
    // @ts-ignore
    email: Joi.string().email(),
  },
});
