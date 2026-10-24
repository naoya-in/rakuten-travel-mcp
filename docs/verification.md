# Verification

Date: 2026-10-25, Asia/Tokyo.

## Specification

All seven official API documentation pages were read, including input and output tables. An independent review checked input constraints, defaults and area traversal. `npm run check:spec` compares the published input parameter names and endpoint versions with the MCP schemas. It confirmed coverage for:

| API | Version | Exposed input fields |
| --- | --- | --- |
| SimpleHotelSearch | 20260731 | 19 |
| HotelDetailSearch | 20260731 | 8 |
| VacantHotelSearch | 20170426 | 32 |
| GetAreaClass | 20140210 | 3 |
| KeywordHotelSearch | 20260731 | 14 |
| GetHotelChainList | 20131024 | 3 |
| HotelRanking | 20170426 | 5 |

The shared authentication fields are configured on the server. JSON is fixed, so XML/JSONP and callback are intentionally excluded. The exposed field counts include affiliateId, elements and formatVersion. Dynamic area-leaf validity is checked by the upstream API, not by an extra hierarchy fetch on each search.

## Runtime

`npm run check`: TypeScript source/test/script checks, all 20 automated tests, and production build passed. Tests cover schema constraints, real dates, per-room guest options, CSV serialization, API errors and credential redaction, timeout/cancellation, sequential requests, area hierarchy traversal, MCP initialization/tool calls/resource reads, explicit pagination, stdio startup from an unrelated working directory, and EOF shutdown with active and queued requests.

`npm run test:live`: all eight tools passed through the official MCP client and the compiled stdio server, using the supplied credentials and registered website. All two resources were also read successfully.

| Tool | Live check |
| --- | --- |
| get_hotel_chains | Full chain response received |
| get_area_class | Full hierarchy received |
| find_area_codes | 新宿 lookup returned complete area paths |
| search_hotels_by_keyword | 東京, hits=1 returned hotels and pagingInfo |
| search_hotels | Tokyo Station coordinates, hits=1 returned a hotel |
| get_hotel_details | Returned full details for that hotel, responseType=large |
| get_hotel_rankings | all/onsen/premium returned Rankings |
| search_vacant_hotels | Tokyo Station, two adults, seven days ahead, plan-level search returned hotels/plans |

These are happy-path checks of every API, not a live test of every possible parameter combination. Availability and prices can change.

The gateway returned `REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING` without Origin, including when Referer was present. Sending the origin of the user-confirmed registered URL resolved the error. This is observed behavior, not a claim that the documentation specifies the gateway's header implementation.

## Independent review

- Fixed: area sibling traversal, required keyword, decimal-only facility-number CSV, precise facility sort descriptions, preservation of Retry-After on non-JSON errors, and shutdown on stdin EOF.
- The pinned MCP SDK 1.32.2 ignores cancellation notifications whose numeric requestId is 0, due to a falsy-value check in its protocol implementation. Cancellation for normal subsequent request IDs and transport closure is supported. No dependency internals were patched. Recheck on SDK upgrades.
- antislop visual Delivery Gate: not applicable because no graphical UI or visual assets were created. Build/run verification is recorded above.

Credentials are stored in ignored .env and, after the MCP configuration follow-up, in ignored mcp-config.local.json for client env injection. At the initial local handoff, no external repository had been created and nothing had been pushed.

## MCP configuration follow-up, 2026-10-25

MCP client env fields now provide application ID, access key, optional affiliate ID and the allowed website URL. The server loads a file only when --env-file or RAKUTEN_ENV_FILE is explicit. A new stdio integration test checks the request produced from all four client inputs, including Referer/Origin, and verifies that an omitted affiliate ID does not inherit a value from the project's local credentials.

All 21 automated tests and the build passed. The updated ignored mcp-config.local.json was also used directly by an MCP client to call get_hotel_chains successfully, without an --env-file argument or implicit project-file loading.

## Public repository check, 2026-10-25

Before publication to https://github.com/naoya-in/rakuten-travel-mcp, all tracked files in both existing commits were checked against the supplied credentials and credential patterns. No matches were found. Local-only .env and *.local.json files were absent from those histories. The GitHub repository was confirmed public with Pages disabled, and no deployment workflows or hosting configuration are present. Only README clone instructions and these publication records changed for publication; application code and the previously tested build are unchanged.
