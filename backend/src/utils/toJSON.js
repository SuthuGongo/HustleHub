// Shared Mongoose plugin: expose "id" instead of "_id"/"__v" and make sure a
// password hash can never leak, even if a query accidentally selects it.
module.exports = function cleanJson(schema) {
  schema.set('toJSON', {
    virtuals: false,
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.passwordHash;
      return ret;
    },
  });
};
