import { EventEmitter } from "events";
import pg from "pg";
import log4js from "log4js";
import { SuggestionID } from "../../suggestions/models.js";
import { DataAccessLayer } from "../dal.js";
import { SuggestionStatus } from "../suggestions/Suggestion.js";
import Control from "./Control.js";

export function convertToControl(row: any) {
  const control = new Control(
    row.title,
    row.description,
    row.in_place,
    row.model_id,
    row.component_id,
    row.created_by,
    row.suggestion_id ? new SuggestionID(row.suggestion_id) : undefined
  );
  control.id = row.id;
  control.createdAt = row.created_at * 1000;
  control.updatedAt = row.updated_at * 1000;
  return control;
}

export class ControlDataService extends EventEmitter {
  constructor(pool: pg.Pool, dal: DataAccessLayer) {
    super();
    this.pool = pool;
    this.dal = dal;
    this.log = log4js.getLogger("ControlDataService");
  }

  private pool: pg.Pool;
  private dal: DataAccessLayer;
  log: any;
  /**
   * Create a control object of specified id
   * @param {Control} control - Control creation object
   * @returns {string}
   */
  async create(control: Control) {
    const query = `
      INSERT INTO controls (
        title, in_place, model_id, component_id, created_by, suggestion_id, description
      )
      VALUES (
        $1::varchar, $2::bool, $3::uuid, $4::uuid, $5::varchar, $6, $7::varchar
      )
      RETURNING id;
    `;
    const {
      title,
      inPlace,
      modelId,
      componentId,
      createdBy,
      suggestionId,
      description,
    } = control;
    const res = await this.pool.query(query, [
      title,
      inPlace,
      modelId,
      componentId,
      createdBy,
      suggestionId?.val,
      description,
    ]);

    this.emit("updated-for", { modelId, componentId });

    return res.rows[0].id;
  }

  /**
   * Retrieve a control object
   * @param {string} id - Control identifier
   * @returns {Control}
   */
  async getById(id: string) {
    const query = `
      SELECT
        id,
        title,
        description,
        in_place,
        model_id,
        component_id,
        suggestion_id,
        created_by,
        extract(epoch from created_at) as created_at,
        extract(epoch from updated_at) as updated_at
      FROM controls
      WHERE id = $1::uuid
      AND deleted_at IS NULL
      ORDER BY created_at ASC
    `;
    const res = await this.pool.query(query, [id]);

    if (res.rows.length === 0) {
      return null;
    }

    return convertToControl(res.rows[0]);
  }

  /**
   * Retrieve the controls objects
   * @param {string} modelId - Model identifier
   * @returns {Control}
   */
  async list(modelId: string) {
    const query = `
      SELECT
        id,
        title,
        description,
        in_place,
        model_id,
        component_id,
        suggestion_id,
        created_by,
        extract(epoch from created_at) as created_at,
        extract(epoch from updated_at) as updated_at
      FROM controls
      WHERE model_id = $1::uuid
      AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    const res = await this.pool.query(query, [modelId]);

    if (res.rows.length === 0) {
      return [];
    }

    return res.rows.map((record) => convertToControl(record));
  }

  /**
   * Delete control by model id and component id
   * @param modelId
   * @param componentIds
   * @returns
   */
  async deleteByComponentId(modelId: string, componentIds: string[]) {
    const ids = (await this.list(modelId))
      .filter((c) => componentIds.includes(c.componentId))
      .map((c) => c.id!);
    return this.delete(modelId, ...ids);
  }

  /**
   * Delete control by id(s)
   * @param id
   */
  async delete(modelId: string, ...ids: string[]) {
    if (!ids || ids.length === 0) {
      return false;
    }

    const filter = `IN (${ids.map((_, i) => `$${2 + i}::uuid`).join(",")})`;
    const query = `
      UPDATE controls
      SET deleted_at = CURRENT_TIMESTAMP      
      WHERE model_id = $1::uuid AND id ${filter}
      RETURNING model_id, component_id, suggestion_id
   `;

    const queryMitigations = `
      UPDATE mitigations m
      SET deleted_at = CURRENT_TIMESTAMP
      FROM controls c      
      WHERE c.model_id = $1::uuid AND m.control_id = c.id AND c.id ${filter}      
   `;

    const client = await this.pool.connect();
    let result = false;
    try {
      await client.query("BEGIN");
      const res = await client.query(query, [modelId, ...ids]);
      result = res.rowCount > 0;

      if (result) {
        const suggestionIds = res.rows
          .filter((v: any) => v.suggestion_id)
          .map((v: any) => new SuggestionID(v.suggestion_id));

        const promises = suggestionIds.map((id: SuggestionID) =>
          this.dal.suggestionService.setSuggestionStatus(
            modelId,
            id,
            SuggestionStatus.New
          )
        );
        await Promise.all(promises);

        await client.query(queryMitigations, [modelId, ...ids]);
        this.emit("deleted-for", {
          modelId: modelId,
          componentId: res.rows[0].component_id,
        });
      }
      await client.query("COMMIT");
    } catch (e) {
      this.log.error("Failed to delete control", e);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    return result;
  }

  /**
   * Update control fields by id
   * @param id
   * @param fields
   */
  async update(
    modelId: string,
    id: string,
    fields: { inPlace?: boolean; title?: string; description?: string }
  ) {
    const fieldStatements = [];
    const params = [];
    if (fields.inPlace !== undefined) {
      params.push(fields.inPlace);
      fieldStatements.push(`in_place = $${params.length}`);
    }
    if (fields.title !== undefined) {
      params.push(fields.title);
      fieldStatements.push(`title = $${params.length}`);
    }
    if (fields.description !== undefined) {
      params.push(fields.description);
      fieldStatements.push(`description = $${params.length}`);
    }

    if (params.length === 0) return false;

    params.push(modelId);
    params.push(id);
    const query = `
      UPDATE controls
      SET ${fieldStatements.join(", ")}
      WHERE model_id = $${params.length - 1}::uuid AND id = $${
      params.length
    }::uuid
      RETURNING *;
    `;

    const res = await this.pool.query(query, params);

    if (res.rowCount > 0) {
      this.emit("updated-for", {
        modelId: res.rows[0].model_id,
        componentId: res.rows[0].component_id,
      });
      return convertToControl(res.rows[0]);
    }
    return false;
  }
}
