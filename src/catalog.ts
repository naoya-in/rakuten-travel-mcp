import { z } from 'zod';

const nonempty = z.string().trim().min(1);
const integer = (min: number, max: number) => z.number().int().min(min).max(max);
const choice = <T extends number>(values: readonly T[]) => z.union(values.map(v => z.literal(v)));
function csv<T extends z.ZodType<string | number>>(item: T, max: number) {
  return z.union([
    z.array(item).min(1).max(max),
    nonempty.refine(value => {
      const values = value.split(',');
      return values.length <= max && values.every(v => {
        const token = v.trim();
        if (item instanceof z.ZodNumber && !/^\d+$/.test(token)) return false;
        return item.safeParse(item instanceof z.ZodNumber ? Number(token) : token).success && token.length > 0;
      });
    }, `Use 1 to ${max} comma-separated valid values.`),
  ]);
}

const common = {
  affiliateId: nonempty.optional().describe('Override the configured affiliate ID for this request.'),
  elements: csv(nonempty, 200).optional().describe('Response field names, as CSV or an array. Omit for all fields.'),
  formatVersion: choice([1, 2]).default(2).describe('JSON structure version. MCP defaults to the flatter version 2.'),
};
const area = {
  largeClassCode: nonempty.optional().describe('Country code from get_area_class, e.g. japan. Include all child codes down to a leaf.'),
  middleClassCode: nonempty.optional().describe('Prefecture code from get_area_class, e.g. tokyo.'),
  smallClassCode: nonempty.optional().describe('City/area code from get_area_class.'),
  detailClassCode: nonempty.optional().describe('Detailed area code from get_area_class, when a child exists.'),
};
const hotelNumbers = csv(integer(1, 9_999_999_999), 15);
const location = {
  ...area,
  hotelNo: z.union([integer(1, 9_999_999_999), hotelNumbers]).optional()
    .describe('One hotel number, or up to 15 numbers as CSV/array. Takes precedence over coordinates and area codes.'),
  latitude: z.number().finite().optional().describe('Latitude. WGS84 degrees by default (datumType=1); Tokyo Datum seconds with datumType=2.'),
  longitude: z.number().finite().optional().describe('Longitude, in the same datum as latitude. Supply both coordinates.'),
  searchRadius: z.number().min(0.1).max(3).multipleOf(0.1).optional().describe('Coordinate search radius in km, 0.1 to 3.0 in steps of 0.1.'),
};
const display = {
  carrier: choice([0, 1]).optional().describe('0: PC/smartphone (API default), 1: feature phone.'),
  datumType: choice([1, 2]).default(1).describe('1: WGS84 degrees (MCP default), 2: Tokyo Datum seconds (API default). Applies to input and output.'),
  hotelThumbnailSize: choice([1, 2, 3]).optional().describe('Hotel thumbnail size: 1 small, 2 medium, 3 large.'),
  responseType: z.enum(['small', 'middle', 'large']).optional().describe('Detail level; large includes all available information.'),
};
const paging = {
  page: integer(1, 100).optional().describe('Page number, 1 to 100 (API default: 1).'),
  hits: integer(1, 30).optional().describe('Results per page, 1 to 30 (API default: 30). Read pagingInfo to fetch subsequent pages.'),
};
const sort = z.enum(['standard', '+roomCharge', '-roomCharge']).optional()
  .describe('standard: recommended/relevance/distance; +roomCharge: cheapest first; -roomCharge: highest price first.');
const basicConditions = z.enum(['kinen', 'internet', 'daiyoku', 'onsen']);
const date = z.iso.date().describe('Calendar date in YYYY-MM-DD format.');

type Args = Record<string, unknown>;
function checkLocation(args: Args, ctx: z.RefinementCtx): void {
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (args.hotelNo !== undefined) return;
  const lat = args.latitude as number | undefined;
  const lon = args.longitude as number | undefined;
  if (lat !== undefined || lon !== undefined) {
    if (lat === undefined || lon === undefined) issue('latitude', 'Supply both latitude and longitude.');
    const factor = args.datumType === 2 ? 3600 : 1;
    if (lat !== undefined && Math.abs(lat) > 90 * factor) issue('latitude', 'Latitude is outside the selected datum range.');
    if (lon !== undefined && Math.abs(lon) > 180 * factor) issue('longitude', 'Longitude is outside the selected datum range.');
    if (factor === 3600) {
      for (const key of ['latitude', 'longitude']) {
        const value = args[key] as number | undefined;
        if (value !== undefined && Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) {
          issue(key, 'Tokyo Datum seconds allow at most two decimal places.');
        }
      }
    }
    return;
  }
  if (!args.largeClassCode) issue('largeClassCode', 'Specify hotelNo, both coordinates, or area codes starting with largeClassCode.');
  if (args.smallClassCode && !args.middleClassCode) issue('middleClassCode', 'smallClassCode requires middleClassCode.');
  if (args.detailClassCode && !args.smallClassCode) issue('smallClassCode', 'detailClassCode requires smallClassCode.');
}

export interface ApiDefinition {
  name: string;
  api: string;
  version: string;
  title: string;
  description: string;
  documentation: string;
  schema: z.ZodObject;
}

export const apiDefinitions: ApiDefinition[] = [
  {
    name: 'search_hotels', api: 'SimpleHotelSearch', version: '20260731', title: '施設検索',
    description: 'Search Rakuten Travel hotels by hotel numbers, coordinates or leaf area codes. For dates, availability and actual bookable prices use search_vacant_hotels. Returns unmodified API JSON including pagingInfo and links.',
    documentation: 'https://webservice.rakuten.co.jp/documentation/simple-hotel-search',
    schema: z.strictObject({ ...common, ...location, ...display, ...paging,
      squeezeCondition: csv(basicConditions, 4).optional().describe('kinen: non-smoking, internet: internet, daiyoku: large bath, onsen: hot spring. CSV/array.'),
      sort: sort.describe('standard: hotel number order for hotel/area searches, distance order for coordinates. +roomCharge: cheapest first; -roomCharge: highest price first.'),
    }).superRefine(checkLocation),
  },
  {
    name: 'get_hotel_details', api: 'HotelDetailSearch', version: '20260731', title: '施設情報',
    description: 'Get one hotel by hotelNo. Set responseType=large for amenities, meals, baths, accessibility, policies, cancellation and payment information. Returns all API fields without summarization.',
    documentation: 'https://webservice.rakuten.co.jp/documentation/hotel-detail-search',
    schema: z.strictObject({ ...common, ...display, hotelNo: integer(1, 9_999_999_999).describe('Hotel number obtained from search or rankings.') }),
  },
  {
    name: 'search_vacant_hotels', api: 'VacantHotelSearch', version: '20170426', title: '空室・宿泊プラン検索',
    description: 'Find available hotels or room/plan combinations for dates, guests, budget, meals and location. Dates must be supplied together; omit both to search today/tomorrow per the API. Guest counts apply per room. searchPattern=1 searches by plan, 0 by hotel (at most 3 plans/hotel). Follow returned booking links to reserve; this tool does not make reservations.',
    documentation: 'https://webservice.rakuten.co.jp/documentation/vacant-hotel-search',
    schema: z.strictObject({ ...common, ...location, ...display, ...paging,
      checkinDate: date.optional(), checkoutDate: date.optional(),
      adultNum: integer(1, 10).optional().describe('Adults per room (API default: 1).'),
      upClassNum: integer(0, 10).optional().describe('Upper elementary school children per room.'),
      lowClassNum: integer(0, 10).optional().describe('Lower elementary school children per room.'),
      infantWithMBNum: integer(0, 10).optional().describe('Infants with meals and bedding per room.'),
      infantWithMNum: integer(0, 10).optional().describe('Infants with meals only per room.'),
      infantWithBNum: integer(0, 10).optional().describe('Infants with bedding only per room.'),
      infantWithoutMBNum: integer(0, 10).optional().describe('Infants without meals or bedding per room.'),
      roomNum: integer(1, 10).optional().describe('Number of rooms (API default: 1).'),
      minCharge: integer(0, 999_999_999).optional().describe('Minimum accommodation charge in yen, as interpreted by the API.'),
      maxCharge: integer(0, 999_999_999).optional().describe('Maximum accommodation charge in yen; must exceed minCharge when both are supplied.'),
      squeezeCondition: csv(z.enum(['kinen', 'internet', 'daiyoku', 'onsen', 'breakfast', 'dinner']), 6).optional()
        .describe('Room/facility/meal filters as CSV/array: kinen, internet, daiyoku, onsen, breakfast, dinner.'),
      searchPattern: choice([0, 1]).optional().describe('0: hotel results (up to 3 plans each), 1: room/plan results.'), sort,
    }).superRefine((args, ctx) => {
      checkLocation(args, ctx);
      if ((args.checkinDate === undefined) !== (args.checkoutDate === undefined)) {
        ctx.addIssue({ code: 'custom', path: ['checkoutDate'], message: 'Supply both checkinDate and checkoutDate, or omit both.' });
      }
      if (args.checkinDate && args.checkoutDate && args.checkoutDate <= args.checkinDate) {
        ctx.addIssue({ code: 'custom', path: ['checkoutDate'], message: 'checkoutDate must be after checkinDate.' });
      }
      if (args.minCharge !== undefined && args.maxCharge !== undefined && args.maxCharge <= args.minCharge) {
        ctx.addIssue({ code: 'custom', path: ['maxCharge'], message: 'maxCharge must exceed minCharge.' });
      }
    }),
  },
  {
    name: 'get_area_class', api: 'GetAreaClass', version: '20140210', title: '地区コード一覧',
    description: 'Get the complete country/prefecture/city/detailed-area hierarchy. For a compact name lookup use find_area_codes. Area searches require the complete path down to a leaf whenever children exist.',
    documentation: 'https://webservice.rakuten.co.jp/documentation/get-area-class',
    schema: z.strictObject(common),
  },
  {
    name: 'search_hotels_by_keyword', api: 'KeywordHotelSearch', version: '20260731', title: 'キーワード・チェーン検索',
    description: 'Search hotels by a required keyword (at least two characters, spaces mean AND), with optional prefecture and up to five chain-code filters from get_hotel_chains. searchField=1 restricts matching to hotel names. Returns pagination and all requested API fields.',
    documentation: 'https://webservice.rakuten.co.jp/documentation/keyword-hotel-search',
    schema: z.strictObject({ ...common, ...display, ...paging,
      keyword: z.string().trim().min(2).describe('Required unencoded search text, at least two characters. Separate AND keywords with spaces.'),
      middleClassCode: nonempty.optional().describe('Prefecture filter, e.g. tokyo.'),
      searchField: choice([0, 1]).optional().describe('0: names/plans/rooms etc., 1: hotel name only.'),
      hotelChainCode: csv(nonempty, 5).optional().describe('Up to five hotel chain codes from get_hotel_chains, as CSV/array.'), sort,
    }),
  },
  {
    name: 'get_hotel_chains', api: 'GetHotelChainList', version: '20131024', title: 'ホテルチェーン一覧',
    description: 'List all hotel chain codes and names. Use hotelChainCode in search_hotels_by_keyword to search facilities belonging to a chain.',
    documentation: 'https://webservice.rakuten.co.jp/documentation/get-hotel-chain-list',
    schema: z.strictObject(common),
  },
  {
    name: 'get_hotel_rankings', api: 'HotelRanking', version: '20170426', title: 'ホテルランキング',
    description: 'Get Rakuten Travel rankings for all (overall), onsen (hot spring inns) and premium (luxury hotels/inns). Multiple genres accepted. Rankings may differ from the website. Returns update time and original hotel/affiliate links.',
    documentation: 'https://webservice.rakuten.co.jp/documentation/hotel-ranking',
    schema: z.strictObject({ ...common,
      genre: csv(z.enum(['all', 'onsen', 'premium']), 3).optional().describe('Ranking genres as CSV/array. API default: all.'),
      carrier: display.carrier,
    }),
  },
];

export function getApi(name: string): ApiDefinition {
  const definition = apiDefinitions.find(api => api.name === name);
  if (!definition) throw new Error(`Unknown Rakuten Travel tool: ${name}`);
  return definition;
}

export function apiReference(): object {
  return {
    checkedAt: '2026-10-25',
    baseUrl: 'https://openapi.rakuten.co.jp/engine/api/Travel/',
    format: 'json',
    authentication: 'Configured on the server, never supplied in tool arguments. accessKey is sent as a header.',
    defaults: { formatVersion: 2, datumType: 1 },
    apis: apiDefinitions.map(({ schema, ...api }) => ({ ...api, inputSchema: z.toJSONSchema(schema, { io: 'input' }) })),
  };
}
