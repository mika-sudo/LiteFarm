import knex from '../util/knex.js';
import BaseModel from './baseModel.js';
import { Model } from 'objection';
import IrrigationTaskModel from './irrigationTaskModel.js';

class IrrigationTypesModel extends BaseModel {
  static get tableName() {
    return 'irrigation_type';
  }

  static get idColumn() {
    return 'irrigation_type_id';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: [''],
      properties: {
        irrigation_type_id: { type: 'string' },
        irrigation_type_name: { type: 'string' },
        farm_id: { type: 'string' },
        default_measuring_type: { type: 'string' },
        ...this.baseProperties,
      },
      additionalProperties: false,
    };
  }

  static get relationMappings() {
    // Import models here to prevent require loops.
    return {
      irrigation_task: {
        relation: Model.BelongsToOneRelation,
        // The related model. This can be either a Model
        // subclass constructor or an absolute file path
        // to a module that exports one.
        modelClass: IrrigationTaskModel,
        join: {
          from: 'irrigation_task.irrigation_type_id',
          to: 'irrigation_type.irrigation_type_id',
        },
      },
    };
  }
  static async checkFarmIrrigationTypeExists(data, farm_id) {
    const checkFarmIrrigationTypeExists = await IrrigationTypesModel.query()
      .select('irrigation_type_id')
      .where('irrigation_type_name', data.irrigation_task.irrigation_type_name)
      .andWhere('farm_id', farm_id)
      .first();
    return {
      checkFarmIrrigationTypeExists,
    };
  }
  static async checkAndAddCustomIrrigationType(data, farm_id) {
    const customIrrigationType = {
      irrigation_type_name: data.irrigation_task.irrigation_type_name,
      farm_id,
      default_measuring_type: data.irrigation_task.measuring_type,
      user_id: data.owner_user_id,
    };
    const irrigationTypeExists = await IrrigationTypesModel.query()
      .select('irrigation_type_id')
      .where((builder) => {
        builder.where('irrigation_type_name', data.irrigation_task.irrigation_type_name);
        builder.where({ farm_id }).orWhereNull('farm_id');
      })
      .first();
    const irrigation_type = irrigationTypeExists
      ? irrigationTypeExists
      : await IrrigationTypesModel.insertCustomIrrigationType({ ...customIrrigationType });
    data.irrigation_task.irrigation_type_id = irrigation_type.irrigation_type_id;
    return {
      customIrrigationType,
    };
  }

  static async insertCustomIrrigationType(row) {
    const { user_id, ...rest } = row;
    await IrrigationTypesModel.query()
      .context({ user_id })
      .upsertGraph({ ...rest }, { insertMissing: true });
    return await IrrigationTypesModel.query()
      .select('irrigation_type_id')
      .where((builder) => {
        builder.where('irrigation_type_name', row.irrigation_type_name);
        builder.where({ farm_id: row.farm_id }).orWhereNull('farm_id');
      })
      .first();
  }

  static async updateIrrigationType(irrigationTypeValues) {
    const { user_id, irrigation_type_id, ...rest } = irrigationTypeValues;
    return await IrrigationTypesModel.query()
      .context({ user_id })
      .findById(irrigation_type_id)
      .patch({ ...rest });
  }

  static async getAllIrrigationTaskTypesByFarmId(farm_id) {
    const data = await knex.raw(`SELECT * FROM (
    SELECT DISTINCT ON (UPPER(irrigation_type_name)) it.*
    FROM irrigation_type AS it
    WHERE farm_id = '${farm_id}'
    OR farm_id IS NULL) AS a
    ORDER BY (UPPER(irrigation_type_name)) ASC;`);
    return data.rows;
  }
}
export default IrrigationTypesModel;
