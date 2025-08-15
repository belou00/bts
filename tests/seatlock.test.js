// tests/seatlock.test.js
const request = require('supertest');
const app = require('../src/app');
const Seat = require('../src/models/Seat');

describe('Seat locking', ()=>{
  it('prevents double hold', async ()=>{
    // arrange: seat available
    await Seat.create({ seatId:'A1-001', zoneKey:'A1', seasonCode:'2025-2026', status:'available' });
    // try: hold twice
    const r1 = await request(app).post('/api/v1/_test/hold').send({ seatId:'A1-001' });
    const r2 = await request(app).post('/api/v1/_test/hold').send({ seatId:'A1-001' });
    expect(r1.status).toBe(200);
    expect([400,409]).toContain(r2.status);
  });
});
