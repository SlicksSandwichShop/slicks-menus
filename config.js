/*
 * Slick's digital menus - site configuration.
 *
 * Things that rarely change live here. Things staff change (prices, specials,
 * hours, holiday closures) live in the Google Sheet, not in this file.
 */
window.SLICKS_CONFIG = {
  // The shop's clock. The Pi's own timezone setting does not matter.
  timezone: "America/Chicago",

  // Published-CSV links, one per Google Sheet tab (File > Share > Publish to web >
  // pick the tab > CSV). Leave a link empty and the page uses the copy bundled
  // in web/data/ instead. See sheet/README.md.
  sheetCsv: {
    items: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRwd_wmQatWaApIe3pzhEdSXNroaG9krZcEVebmksIfFk1NgtbnrJWPRfiRnbCbPtNPeCP63EYZiMxK/pub?gid=1321754203&single=true&output=csv",
    sections: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRwd_wmQatWaApIe3pzhEdSXNroaG9krZcEVebmksIfFk1NgtbnrJWPRfiRnbCbPtNPeCP63EYZiMxK/pub?gid=1220500282&single=true&output=csv",
    specials: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRwd_wmQatWaApIe3pzhEdSXNroaG9krZcEVebmksIfFk1NgtbnrJWPRfiRnbCbPtNPeCP63EYZiMxK/pub?gid=454401100&single=true&output=csv",
    settings: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRwd_wmQatWaApIe3pzhEdSXNroaG9krZcEVebmksIfFk1NgtbnrJWPRfiRnbCbPtNPeCP63EYZiMxK/pub?gid=337377018&single=true&output=csv",
    seasons: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRwd_wmQatWaApIe3pzhEdSXNroaG9krZcEVebmksIfFk1NgtbnrJWPRfiRnbCbPtNPeCP63EYZiMxK/pub?gid=763668556&single=true&output=csv"
  },

  // The Sheet's own ID (the long code in its address, between /d/ and /edit). Only used by the
  // preview page's "draft" option, which shows the Sheet as it is right now, before you publish.
  sheetId: "",

  // How often a screen re-reads the Sheet.
  refreshMinutes: 5,

  // Extra slides shown after the menu on each screen, in order.
  //   image   - a still picture
  //   video   - plays from the start and stays up for its full length. Which file is set by
  //             the Sheet (settings > video, or a season); src here is only the fallback
  //   special - the day's Special (lunch only, on the days listed in Settings)
  screens: {
    1: [{ type: "image", src: "assets/condiments.png" }],
    2: [{ type: "image", src: "assets/welcome.png" }],
    3: [{ type: "video", src: "assets/videos/pepsi-pour.mp4" }, { type: "special" }]
  },

  closedImage: "assets/closed.jpeg",
  facebookImage: "assets/facebook-laptop.png"
};
