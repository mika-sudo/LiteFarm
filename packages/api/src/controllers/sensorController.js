/*
 *  Copyright 2019, 2020, 2021, 2022 LiteFarm.org
 *  This file is part of LiteFarm.
 *
 *  LiteFarm is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  LiteFarm is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 *  GNU General Public License for more details, see <https://www.gnu.org/licenses/>.
 */

const baseController = require('../controllers/baseController');
const sensorModel = require('../models/sensorModel');
const sensorReadingModel = require('../models/sensorReadingModel');
const SensorReadingTypeModel = require('../models/SensorReadingTypeModel');
const IntegratingPartnersModel = require('../models/integratingPartnersModel');
const { transaction, Model } = require('objection');
const { unclaimSensor } = require('../util/ensemble.js');

const {
  createOrganization,
  registerOrganizationWebhook,
  bulkSensorClaim,
} = require('../util/ensemble');
const PartnerReadingTypeModel = require('../models/PartnerReadingTypeModel');
const sensorController = {
  async addSensors(req, res) {
    try {
      const { farm_id } = req.headers;
      const { access_token } = await IntegratingPartnersModel.getAccessAndRefreshTokens(
        'Ensemble Scientific',
      );
      const { data, errors } = parseCsvString(req.file.buffer.toString(), {
        Name: {
          key: 'name',
          parseFunction: (val) => val.trim(),
          validator: (val) => 1 <= val.length && val.length <= 100,
          required: true,
        },
        External_ID: {
          key: 'external_id',
          parseFunction: (val) => val.trim(),
          validator: (val) => 1 <= val.length && val.length <= 20,
          required: false,
        },
        Latitude: {
          key: 'latitude',
          parseFunction: (val) => parseFloat(val),
          validator: (val) => -90 <= val && val <= 90,
          required: true,
        },
        Longitude: {
          key: 'longitude',
          parseFunction: (val) => parseFloat(val),
          validator: (val) => -180 <= val && val <= 180,
          required: true,
        },
        Reading_types: {
          key: 'reading_types',
          parseFunction: (val) => val.replaceAll(' ', '').split(','),
          validator: (val) =>
            val.includes('soil_moisture_content') ||
            val.includes('water_potential') ||
            val.includes('temperature'),
          required: true,
        },
        Depth: {
          key: 'depth',
          parseFunction: (val) => parseFloat(val),
          validator: (val) => 0 <= val && val <= 1000,
          required: false,
        },
        Brand: {
          key: 'brand',
          parseFunction: (val) => val.trim(),
          validator: (val) => val.length <= 100,
          required: false,
        },
        Model: {
          key: 'model',
          parseFunction: (val) => val.trim(),
          validator: (val) => val.length <= 100,
          required: false,
        },
        Hardware_version: {
          key: 'hardware_version',
          parseFunction: (val) => val.trim(),
          validator: (val) => val.length <= 100,
          required: false,
        },
      });
      if (errors.length > 0) {
        res.status(400).send({ error_type: 'validation_failure', errors });
      } else {
        console.log(data);
        const organization = await createOrganization(farm_id, access_token);
        console.log(organization);
        const esids = data.reduce((previous, current) => {
          if (current.brand === 'Ensemble Scientific' && current.external_id) {
            previous.push(current.external_id);
          }
          return previous;
        }, []);
        await registerOrganizationWebhook(farm_id, organization.organization_uuid, access_token);
        const registeredSensors = await bulkSensorClaim(
          access_token,
          organization.organization_uuid,
          esids,
        );
        console.log(registeredSensors);
        for (const sensor of data) {
          if (registeredSensors.success.includes(sensor.external_id)) {
            const savedSensor = await sensorModel.query().insert({
              farm_id,
              name: sensor.name,
              grid_points: {
                lat: sensor.latitude,
                lng: sensor.longitude,
              },
              partner_id: 1,
              depth: sensor.depth,
              external_id: sensor.external_id,
            });
            const readingTypes = await Promise.all(
              sensor.reading_types.map((r) => {
                return PartnerReadingTypeModel.getReadingTypeByReadableValue(r);
              }),
            );
            console.log(readingTypes);
            await SensorReadingTypeModel.query().insert(
              readingTypes.map((readingType) => {
                return {
                  partner_reading_type_id: readingType.partner_reading_type_id,
                  sensor_id: savedSensor.sensor_id,
                };
              }),
            );
          }
        }
        if (
          registeredSensors.success.length + registeredSensors.already_owned.length <
          esids.length
        ) {
          res.status(400).send({
            error_type: 'unable_to_claim_all_sensors',
            registeredSensors,
          });
        } else {
          res.status(200).send({ message: 'Successfully uploaded!' });
        }
      }
    } catch (e) {
      console.log(e);
      res.status(500).send(e.message);
    }
  },

  async deleteSensor(req, res) {
    try {
      const trx = await transaction.start(Model.knex());
      const isDeleted = await baseController.delete(sensorModel, req.params.sensor_id, req, {
        trx,
      });
      await trx.commit();
      if (isDeleted) {
        res.sendStatus(200);
      } else {
        res.sendStatus(404);
      }
    } catch (error) {
      res.status(400).json({
        error,
      });
    }
  },

  async getSensorsByFarmId(req, res) {
    try {
      const { farm_id } = req.body;
      if (!farm_id) {
        return res.status(400).send('No farm selected');
      }
      const data = await baseController.getByFieldId(sensorModel, 'farm_id', farm_id);
      res.status(200).send(data);
    } catch (error) {
      res.status(400).json({
        error,
      });
    }
  },

  async addReading(req, res) {
    const trx = await transaction.start(Model.knex());
    try {
      const infoBody = [];
      for (const sensor of req.body) {
        const corresponding_sensor = await sensorModel
          .query()
          .select('sensor_id')
          .where('external_id', sensor.sensor_esid)
          .where('partner_id', req.params.partner_id);
        for (let i = 0; i < sensor.value.length; i++) {
          const row = {
            read_time: sensor.time[i],
            sensor_id: corresponding_sensor[0].sensor_id,
            reading_type: sensor.parameter_number,
            value: sensor.value[i],
            unit: sensor.unit,
          };
          // Only include this entry if all required values are poulated
          if (Object.values(row).every((value) => value)) {
            infoBody.push(row);
          }
        }
      }
      if (infoBody.length === 0) {
        res.status(200).send(infoBody);
      } else {
        const result = await baseController.postWithResponse(sensorReadingModel, infoBody, req, {
          trx,
        });
        await trx.commit();
        res.status(200).send(result);
      }
    } catch (error) {
      res.status(400).json({
        error,
      });
    }
  },

  async getAllReadingsBySensorId(req, res) {
    try {
      const { sensor_id } = req.body;
      if (!sensor_id) {
        res.status(400).send('No sensor selected');
      }
      const data = await baseController.getByFieldId(sensorReadingModel, 'sensor_id', sensor_id);
      const validReadings = data.filter((datapoint) => datapoint.valid);
      res.status(200).send(validReadings);
    } catch (error) {
      res.status(400).json({
        error,
      });
    }
  },

  async invalidateReadings(req, res) {
    try {
      const { start_time, end_time } = req.body;
      const result = await sensorReadingModel
        .query()
        .patch({ valid: false })
        .where('read_time', '>=', start_time)
        .where('read_time', '<=', end_time);
      res.status(200).send(`${result} entries invalidated`);
    } catch (error) {
      res.status(400).json({
        error,
      });
    }
  },

  async retireSensor(req, res) {
    try {
      const org_id = req.body.org_id;
      const external_id = req.body.external_id;
      const { access_token } = await IntegratingPartnersModel.getAccessAndRefreshTokens(
        'Ensemble Scientific',
      );
      const response = await unclaimSensor(org_id, external_id, access_token);
      res.status(200).send(response.data.detail);
      // TODO: Delete sensor from DB
    } catch (error) {
      res.status(400).json({
        error,
      });
    }
  },
};

/**
 * Parses the csv string into an array of objects and an array of any lines that experienced errors.
 * @param {String} csvString
 * @param {Object} mapping - a mapping from csv column headers to object keys, as well as the validators for the data in the columns
 * @param {String} delimiter
 * @returns {Object<data: Array<Object>, errors: Array<Object>>}
 */

const parseCsvString = (csvString, mapping, delimiter = ',') => {
  // regex checks for delimiters that are not contained within quotation marks
  const regex = new RegExp(`(?!\\B"[^"]*)${delimiter}(?![^"]*"\\B)`);
  const headers = csvString.substring(0, csvString.indexOf('\n')).split(regex);
  const allowedHeaders = Object.keys(mapping);
  const { data, errors } = csvString
    .substring(csvString.indexOf('\n') + 1)
    .split('\n')
    .reduce(
      (previous, row, rowIndex) => {
        const values = row.split(regex);
        const parsedRow = headers.reduce((previousObj, current, index) => {
          if (allowedHeaders.includes(current)) {
            const val = mapping[current].parseFunction(
              values[index].replace(/^(["'])(.*)\1$/, '$2'),
            ); // removes any surrounding quotation marks
            if (mapping[current].validator(val)) {
              previousObj[mapping[current].key] = val;
            } else {
              previous.errors.push({ line: rowIndex + 2, errorColumn: current }); //TODO: add better error messages
            }
          }
          return previousObj;
        }, {});
        previous.data.push(parsedRow);
        return previous;
      },
      { data: [], errors: [] },
    );
  return { data, errors };
};

module.exports = sensorController;