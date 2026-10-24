import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flattenAreas } from '../src/areas.js';

export const areaFixture = { areaClasses: { largeClasses: [[
  { largeClassCode: 'japan', largeClassName: '日本' },
  { middleClasses: [[{ middleClassCode: 'tokyo', middleClassName: '東京都' },
    { smallClasses: [[{ smallClassCode: 'tokyo', smallClassName: '東京２３区' },
      { detailClasses: [{ detailClass: { detailClassCode: 'B', detailClassName: '新宿・中野' } },
        { detailClass: { detailClassCode: 'A', detailClassName: '東京駅・銀座' } }] }]] }]] },
]] } };

test('area paths retain ancestor codes across fragment arrays and wrappers', () => {
  const areas = flattenAreas(areaFixture);
  assert.equal(areas.length, 5);
  assert.deepEqual(areas.filter(area => area.leaf).map(area => [area.detailClassCode, area.largeClassCode, area.middleClassCode, area.smallClassCode]),
    [['B', 'japan', 'tokyo', 'tokyo'], ['A', 'japan', 'tokyo', 'tokyo']]);
});

test('area arrays containing multiple countries are not merged', () => {
  const areas = flattenAreas({ areaClasses: { largeClasses: [
    { largeClassCode: 'japan', largeClassName: '日本' },
    { largeClassCode: 'overseas', largeClassName: '海外' },
  ] } });
  assert.deepEqual(areas.map(area => area.largeClassCode), ['japan', 'overseas']);
  assert(areas.every(area => area.leaf));
});

test('a leaf city does not need a detail code', () => {
  const areas = flattenAreas({ largeClassCode: 'japan', middleClasses: [{ middleClassCode: 'kyoto',
    smallClasses: [{ smallClassCode: 'miyazu', smallClassName: '宮津' }] }] });
  const leaf = areas.find(area => area.leaf);
  assert.equal(leaf?.smallClassCode, 'miyazu');
  assert.equal(leaf?.detailClassCode, undefined);
});
