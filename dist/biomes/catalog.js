/* Biome scripts register themselves before the game and both renderers start. */
(() => {
  'use strict';

  const definitions = new Map();
  const models = new Map();
  const flat = () => 0;
  function register(id, definition) {
    if (definitions.has(id)) throw new Error('Biome déjà enregistré : ' + id);
    definitions.set(id, {
      id, height:flat, roadColor:'#595564', shoulder:.68, curb:false,
      roadDetails:[], skyline:true, ...definition
    });
  }
  function model(id, build) {
    if (models.has(id)) throw new Error('Modèle déjà enregistré : ' + id);
    models.set(id, build);
  }
  window.BusBiomes = {register, model, definitions, models, LANE_WIDTH:3.65};
})();
