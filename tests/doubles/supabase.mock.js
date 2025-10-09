// tests/doubles/supabase.mock.js
// Mock Supabase client for integration tests (Sprint 2)

/**
 * Mock Supabase client
 * Provides in-memory query engine for testing without real DB
 *
 * Usage:
 *   const supabase = createMockSupabase({ transactions: [...], rules: [...] });
 *   const { data } = await supabase.from('transactions').select('*').eq('amount', 1000);
 */

export class MockSupabaseQuery {
  constructor(table, data) {
    this.table = table;
    this.data = data;
    this.filters = [];
    this.selectFields = '*';
    this.limitValue = null;
    this.orderByField = null;
    this.orderDirection = 'asc';
  }

  select(fields = '*') {
    this.selectFields = fields;
    return this;
  }

  eq(field, value) {
    this.filters.push({ op: 'eq', field, value });
    return this;
  }

  neq(field, value) {
    this.filters.push({ op: 'neq', field, value });
    return this;
  }

  gt(field, value) {
    this.filters.push({ op: 'gt', field, value });
    return this;
  }

  lt(field, value) {
    this.filters.push({ op: 'lt', field, value });
    return this;
  }

  gte(field, value) {
    this.filters.push({ op: 'gte', field, value });
    return this;
  }

  lte(field, value) {
    this.filters.push({ op: 'lte', field, value });
    return this;
  }

  in(field, values) {
    this.filters.push({ op: 'in', field, values });
    return this;
  }

  limit(n) {
    this.limitValue = n;
    return this;
  }

  order(field, { ascending = true } = {}) {
    this.orderByField = field;
    this.orderDirection = ascending ? 'asc' : 'desc';
    return this;
  }

  async execute() {
    let results = [...this.data];

    // Apply filters
    for (const filter of this.filters) {
      results = results.filter(row => {
        const fieldValue = row[filter.field];
        switch (filter.op) {
          case 'eq': return fieldValue === filter.value;
          case 'neq': return fieldValue !== filter.value;
          case 'gt': return fieldValue > filter.value;
          case 'lt': return fieldValue < filter.value;
          case 'gte': return fieldValue >= filter.value;
          case 'lte': return fieldValue <= filter.value;
          case 'in': return filter.values.includes(fieldValue);
          default: return true;
        }
      });
    }

    // Apply ordering
    if (this.orderByField) {
      results.sort((a, b) => {
        const aVal = a[this.orderByField];
        const bVal = b[this.orderByField];
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return this.orderDirection === 'asc' ? cmp : -cmp;
      });
    }

    // Apply limit
    if (this.limitValue !== null) {
      results = results.slice(0, this.limitValue);
    }

    // Apply select (field projection)
    if (this.selectFields !== '*') {
      const fields = this.selectFields.split(',').map(f => f.trim());
      results = results.map(row => {
        const projected = {};
        for (const field of fields) {
          projected[field] = row[field];
        }
        return projected;
      });
    }

    return { data: results, error: null };
  }
}

export class MockSupabaseClient {
  constructor(fixtures = {}) {
    this.fixtures = fixtures;
    this.callLog = [];
  }

  from(table) {
    this.callLog.push({ method: 'from', table });
    const data = this.fixtures[table] || [];
    return new MockSupabaseQuery(table, data);
  }

  async insert(table, rows) {
    this.callLog.push({ method: 'insert', table, rows });
    if (!this.fixtures[table]) {
      this.fixtures[table] = [];
    }
    this.fixtures[table].push(...(Array.isArray(rows) ? rows : [rows]));
    return { data: rows, error: null };
  }

  async update(table, id, updates) {
    this.callLog.push({ method: 'update', table, id, updates });
    const data = this.fixtures[table] || [];
    const row = data.find(r => r.id === id);
    if (row) {
      Object.assign(row, updates);
      return { data: row, error: null };
    }
    return { data: null, error: { message: 'Not found', code: '404' } };
  }

  async delete(table, id) {
    this.callLog.push({ method: 'delete', table, id });
    const data = this.fixtures[table] || [];
    const index = data.findIndex(r => r.id === id);
    if (index !== -1) {
      const deleted = data.splice(index, 1);
      return { data: deleted[0], error: null };
    }
    return { data: null, error: { message: 'Not found', code: '404' } };
  }

  resetCallLog() {
    this.callLog = [];
  }
}

/**
 * Create a mock Supabase client with fixtures
 * @param {Object} fixtures - { transactions: [...], rules: [...], ... }
 * @returns {MockSupabaseClient}
 */
export function createMockSupabase(fixtures = {}) {
  return new MockSupabaseClient(fixtures);
}

// Sprint 2 TODO:
// - Add support for .rpc() calls (for custom Postgres functions)
// - Add support for .count() aggregation
// - Add support for complex joins (if needed)
// - Add fixtures loader from JSON files
