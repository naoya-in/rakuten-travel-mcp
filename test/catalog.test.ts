import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiDefinitions, apiReference, getApi } from '../src/catalog.js';

test('all seven APIs have explicit current versions and serializable schemas', () => {
  assert.deepEqual(apiDefinitions.map(api => [api.api, api.version]), [
    ['SimpleHotelSearch', '20260731'], ['HotelDetailSearch', '20260731'], ['VacantHotelSearch', '20170426'],
    ['GetAreaClass', '20140210'], ['KeywordHotelSearch', '20260731'], ['GetHotelChainList', '20131024'], ['HotelRanking', '20170426'],
  ]);
  assert.doesNotThrow(() => JSON.stringify(apiReference()));
});

test('facility search enforces location combinations and honors upstream precedence', () => {
  const schema = getApi('search_hotels').schema;
  assert(!schema.safeParse({}).success);
  assert(!schema.safeParse({ latitude: 35 }).success);
  assert(!schema.safeParse({ latitude: 95, longitude: 139 }).success);
  assert(!schema.safeParse({ largeClassCode: 'japan', detailClassCode: 'A' }).success);
  assert(schema.safeParse({ largeClassCode: 'japan', middleClassCode: 'tokyo', smallClassCode: 'tokyo', detailClassCode: 'A' }).success);
  assert(schema.safeParse({ hotelNo: 123, latitude: 1000 }).success);
  assert(schema.safeParse({ latitude: 128216.17, longitude: 503259.29, datumType: 2 }).success);
  assert(!schema.safeParse({ latitude: 128216.171, longitude: 503259.29, datumType: 2 }).success);
  assert(!schema.safeParse({ hotelNo: 123, page: 101 }).success);
  assert(!schema.safeParse({ hotelNo: 123, searchRadius: 0.15 }).success);
  assert(!schema.safeParse({ hotelNo: Array(16).fill(1) }).success);
  assert(!schema.safeParse({ hotelNo: '123,,' }).success);
  assert(!schema.safeParse({ hotelNo: '0x10,2' }).success);
  assert(!schema.safeParse({ hotelNo: '1e3,2' }).success);
  assert(!schema.safeParse({ hotelNo: 123, accessKey: 'not-a-tool-argument' }).success);
  assert.equal(schema.parse({ hotelNo: '123,456' }).datumType, 1);
  assert.equal(schema.parse({ hotelNo: [123, 456] }).formatVersion, 2);
});

test('vacancy validates real dates, date ordering, paired dates and budget boundaries', () => {
  const schema = getApi('search_vacant_hotels').schema;
  assert(schema.safeParse({ hotelNo: 123 }).success);
  assert(!schema.safeParse({ hotelNo: 123, checkinDate: '2026-10-30' }).success);
  assert(!schema.safeParse({ hotelNo: 123, checkinDate: '2026-02-30', checkoutDate: '2026-03-02' }).success);
  assert(!schema.safeParse({ hotelNo: 123, checkinDate: '2026-10-30', checkoutDate: '2026-10-30' }).success);
  assert(!schema.safeParse({ hotelNo: 123, minCharge: 10000, maxCharge: 10000 }).success);
  assert(!schema.safeParse({ hotelNo: 123, adultNum: 0 }).success);
  assert(!schema.safeParse({ hotelNo: 123, roomNum: 11 }).success);
  assert(schema.safeParse({ hotelNo: [123, 456], checkinDate: '2026-11-01', checkoutDate: '2026-11-02',
    adultNum: 2, upClassNum: 1, lowClassNum: 1, infantWithMBNum: 1, infantWithMNum: 1,
    infantWithBNum: 1, infantWithoutMBNum: 1, minCharge: 0, maxCharge: 999999999,
    squeezeCondition: ['breakfast', 'dinner'], searchPattern: 1 }).success);
  assert(!getApi('search_hotels').schema.safeParse({ hotelNo: 123, squeezeCondition: 'breakfast' }).success);
});

test('keyword and rankings accept documented CSV/array forms', () => {
  const keyword = getApi('search_hotels_by_keyword').schema;
  assert(!keyword.safeParse({ keyword: '宿' }).success);
  assert(keyword.safeParse({ keyword: '京都 温泉', hotelChainCode: ['JL', 'NK'], searchField: 1 }).success);
  assert(keyword.safeParse({ keyword: 'ホテル', hotelChainCode: 'JL,NK' }).success);
  assert(!keyword.safeParse({ hotelChainCode: 'JL,NK' }).success);
  assert(!keyword.safeParse({ hotelChainCode: 'A,B,C,D,E,F' }).success);
  const ranking = getApi('get_hotel_rankings').schema;
  assert(ranking.safeParse({ genre: 'all,onsen,premium' }).success);
  assert(ranking.safeParse({ genre: ['all', 'premium'] }).success);
  assert(!ranking.safeParse({ genre: 'luxury' }).success);
});
