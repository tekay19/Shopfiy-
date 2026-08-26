const HERO_SECTION_ID = 'slideshow_hero_dEdbwc';
const HERO_BLOCK_ID = 'slide_PahNLV';

function patchSettingsData(settingsDataJsonText, { primaryColorHex, logoFilename }) {
  const data = JSON.parse(settingsDataJsonText);
  data.current = data.current || {};
  data.current.colors_accent_1 = primaryColorHex;
  data.current.colors_accent_2 = primaryColorHex;
  data.current.logo = `shopify://shop_images/${logoFilename}`;
  return JSON.stringify(data, null, 2);
}

function patchHeroSection(indexJsonText, { heading, text, buttonLabel }) {
  const data = JSON.parse(indexJsonText);
  const settings = data.sections[HERO_SECTION_ID].blocks[HERO_BLOCK_ID].settings;
  settings.heading = heading;
  settings.text = text;
  settings.button_label_1 = buttonLabel;
  return JSON.stringify(data, null, 2);
}

module.exports = { patchSettingsData, patchHeroSection, HERO_SECTION_ID, HERO_BLOCK_ID };
