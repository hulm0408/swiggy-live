#!/usr/bin/env bash
# probe.sh — re-run the endpoint discovery from scratch.
# Prints status / bytes / ms for each candidate route, so the findings in README.md
# can be reproduced from any box.
set -u
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
LAT=${LAT:-26.8467}
LNG=${LNG:-80.9462}
RID=${RID:-202787}

probe() {
  local label="$1" url="$2" hdr="${3:-__fetch_request: 1}"
  local out
  out=$(curl -s -o /tmp/probe.out -w "%{http_code} %{size_download} %{time_total}" \
        --max-time 20 -H "User-Agent: $UA" -H "$hdr" "$url")
  printf "%-26s %s\n" "$label" "$out"
}

echo "route                      code bytes    secs"
echo "------------------------------------------------------------------"
probe "list/v5 (dapi)"      "https://www.swiggy.com/dapi/restaurants/list/v5?lat=$LAT&lng=$LNG&is-seo-homepage-enabled=true&page_type=DESKTOP_WEB_LISTING"
probe "search/v3 RESTAURANT" "https://www.swiggy.com/dapi/restaurants/search/v3?lat=$LAT&lng=$LNG&str=biryani&trackingId=undefined&submitAction=ENTER&queryUniqueId=$(uuidgen 2>/dev/null || echo q1)&selectedPLTab=RESTAURANT"
probe "search/v3 DISH"       "https://www.swiggy.com/dapi/restaurants/search/v3?lat=$LAT&lng=$LNG&str=paneer&trackingId=undefined&submitAction=ENTER&queryUniqueId=$(uuidgen 2>/dev/null || echo q2)&selectedPLTab=DISH"
probe "menu/pl (dapi)"       "https://www.swiggy.com/dapi/menu/pl?page-type=REGULAR_MENU&complete-menu=true&lat=$LAT&lng=$LNG&restaurantId=$RID&submitAction=ENTER"
probe "menu/pl (mapi)"       "https://www.swiggy.com/mapi/menu/pl?page-type=REGULAR_MENU&complete-menu=true&lat=$LAT&lng=$LNG&restaurantId=$RID&submitAction=ENTER"
probe "search/suggest"       "https://www.swiggy.com/dapi/restaurants/search/suggest?lat=$LAT&lng=$LNG&str=biry"
probe "instamart/home"       "https://www.swiggy.com/api/instamart/home?pageType=EXPLORE&lat=$LAT&lng=$LNG"
probe "dineout/v2/home"      "https://www.swiggy.com/dapi/dineout/v2/home?lat=$LAT&lng=$LNG"
echo
echo "control — same route with a non-browser UA (shows the edge gate):"
printf "%-26s %s\n" "list/v5 (curl UA)" "$(curl -s -o /dev/null -w '%{http_code} %{size_download} %{time_total}' --max-time 20 'https://www.swiggy.com/dapi/restaurants/list/v5?lat='"$LAT"'&lng='"$LNG"'&page_type=DESKTOP_WEB_LISTING')"
