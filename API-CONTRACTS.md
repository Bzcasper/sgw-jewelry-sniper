# API Contracts — Jewelry Sniper

## buyerapi `https://buyerapi.shopgoodwill.com/api/` (Angular, production:true)

### Search

**POST Search/ItemListing**
- Req: JSON with **STRING booleans** (`"true"/"false"`) — `isSize:false, isWeddingCatagory:"false", isMultipleCategoryIds:false, layout:"", searchText:"gold", selectedCategoryIds:"87", selectedSellerIds:"5", lowPrice:"10", highPrice:"5000", searchBuyNowOnly:"", searchPickupOnly:"false", searchOneCentShippingOnly:"false", searchDescriptions:"false"/"true", searchClosedAuctions:"false", closedAuctionEndingDate:"9/1/2026", closedAuctionDaysBack:"7", searchCanadaShipping:"false", searchInternationalShippingOnly:"false", sortColumn:"1", page:"1", pageSize:"40", sortDescending:"false", savedSearchId:0, useBuyerPrefs:"true", categoryLevel:1, categoryId:0`
- Resp: `{searchResults:{items:[{itemId, sellerId, categoryId, title, currentPrice, minimumBid, numBids, startTime, endTime, imageURL, sellerId, listingType, catFullName}], itemCount:631233}, maxTotalRecords:10000, categoryListModel, sellers:[]}`
- Notes: shard by `selectedCategoryIds`/`selectedSellerIds` to bypass `10k`.

**GET Search/GetItemById/{id}** → single enriched, **GET Search/GetItemsById?itemIds=1,2** → `[{...description HTML, categoryParentList, weight, dimensions, bidIncrement, serverTime}]`
**GET Search/GetActiveLocation** → `[{sellerId, searchFilterName:"IN, Indianapolis", pickupCity}]` 163 rows
**GET Category/GetAllCategoryPageList** → jewelry tree; **GET Search/GetCategoryDropdown?categoryId=88** → subcats
**POST Search/GetCategory** → `500` if STRING boolean mismatch; use `"true"` strings
**POST ItemDetail/CalculateShipping {itemId,country,province,zipCode,quantity,clientIP}` → HTML `FedEx $11.70 + $2.00` or `RATE.LOCATION.NOSERVICE`
**GET ItemDetail/GetItemDetailModelByItemId/{id}** → `{currentPrice, endTime, bidIncrement, reserve, quantity, imageUrlString, categoryParentList}`

### Bid

**GET ItemBid/ShowBidModal?itemId={id}** → `{itemId, sellerId, currentPrice, minimumBid, quantity:1, pickupCity, azureFilePath, listingType}` 200 anon
**GET ItemBid/ItemQuantity?itemId={id}** → `1`
**POST ItemBid/PlaceBid** `{itemId, sellerId, quantity:1, bidAmount:number}` → `{status:bool, result:int, message, pastDueMessage}` result `-110` auth, `-4/-5` low, `-3` reject

### Auth

**POST SignIn/Login {username,password,clientIpAddress}** → `{data:{accessToken, refreshToken:{token,createdByIp}, buyer:{buyerId}}}` → `Authorization: Bearer`
**POST SignIn/RefreshToken {refreshToken,clientIpAddress}** → new access

### Dashboard

**POST Dashboard/GetCurrentTime** → `200` + `Date` header for offset; **GET Dashboard/GetGalleryItems** → `[{itemId, views, featured}]`

### Full list 257 in `/tmp/endpoints_raw.txt`

---

## Census `https://api.census.gov/data/2023/acs/acs5`

**Req:** `GET /data/2023/acs/acs5?get=NAME,B02001_002E,B01002_001E,B19013_001E,B19301_001E,B25077_001E&for=zip%20code%20tabulation%20area:46226&in=state:18&key=$CENSUS_API_KEY`
**Resp:** `[["NAME","B02001_002E",...,"zip code tabulation area"],["ZCTA5 46226","..."]]`
**Geocode:** `GET https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=46226+Indianapolis+IN&benchmark=Public_AR_Current&vintage=Current_Current&format=json` → `{result:{geographies:{"Census Tracts":[{GEOID, COUNTY: "097"}], "Counties":[{GEOID:"18097"}]}}, addressMatches:[{coordinates:{x,y}, geographies:{...}}]}`

**Rate:** 500 qps with key, cache 30d.

**Scoring vars:** `whitePct = B02001_002E/total`, `medianAge = B01002_001E`, `pct65 = sum 65+ / total`, `medianHH = B19013_001E`, `perCapita = B19301_001E`, `homeValue = B25077_001E`.
`richTownScore = z.medianHH / county.medianHH`, `richSurrounding = county / state`.
