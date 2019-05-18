
function find_limits(mapsample, data) {
  var minx = Infinity;
  var miny = Infinity;
  var maxx = -Infinity;
  var maxy = -Infinity;
  var min = Infinity;
  var max = -Infinity;
  var first_sample = data[0];
  var last_sample = data[data.length - 1];
  var tolerance = 0.1;
  var samples = Math.min(50, data.length);

  for (var feature in data) {
    var properties = data[feature].properties;
    var coords = data[feature].geometry.coordinates;
    if (properties.p25 < min) {
      min = properties.p25;
    }
    else if (properties.p25 > max) {
      max = properties.p25;
    }
    if (coords[0] < minx) {
      minx = coords[0];
    }
    else if (coords[0] > maxx) {
      maxx = coords[0];
    }
    if (coords[1] < miny) {
      miny = coords[1];
    }
    else if (coords[1] > maxy) {
      maxy = coords[1];
    }
  }
  d1 = minx - maxx;
  d2 = miny - maxy;
  tolerance = (d2*d2 + d1*d1) / samples;
  return {
    min: min,
    max: max,
    first: first_sample,
    last: last_sample,
    limits: [minx, miny, maxx, maxy],
    tolerance: tolerance
  };
}

function linear_interpolation(ar, ag, ab, br, bg, bb, t) {
  return 'rgb(' +
    Math.round(ar + (br - ar) * t) + ',' +
    Math.round(ag + (bg - ag) * t) + ',' +
    Math.round(ab + (bb - ab) * t) + ')';
}

function pick_color(value) {
  if (value <= 50) {
    return linear_interpolation(5, 141, 5, 30, 161, 15, value / 12);
  }
  else if (value <= 100) {
    return linear_interpolation(250, 250, 1, 247, 240, 16, value / 35.4);
  }
  else if (value <= 150) {
    return linear_interpolation(250, 150, 0, 255, 69, 0, value / 55);
  }
  else if (value <= 200) {
    return linear_interpolation(255, 51, 51, 204, 0, 0, value / 150);
  }
  else if (value <= 300) {
    return linear_interpolation(128, 0, 128, 56, 44, 30, value / 250);
  }
  return linear_interpolation(56, 44, 30, 0, 0, 0, Math.min(1, value / 500));
}

function track_duration(original_duration) {
  var duration = original_duration

  var result = '';
  if (duration > 3600) {
    duration = Math.round(duration / 3600);
    result = duration + ' hora' + (duration === 1 ? '' : 's');
  }
  else if (duration > 60) {
    duration = Math.round(duration / 60);
    result = duration + ' minuto' + (duration === 1 ? '' : 's');
  }
  else {
    result = duration + ' segundo' + (duration === 1 ? '' : 's');
  }
  return result
}

function date_text(initial, end) {
  the_date = new Date(initial * 1000);
  duration = Math.abs(initial - end);
  return the_date + ' ' + ' con ' + track_duration(duration) + ' de recorrido';
}

function name_day(the_date) {
  var day_names = [
    'Domingo',
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado'
  ];
  return day_names[the_date.getDay()];
}

function show_info(prop) {
  return prop.p25 + ' ' + new Date(prop.timestamp * 1000).toLocaleTimeString()
}

function configure_map(mapsample, layerGroup, travelGroup, heatGroup, interpolationGroup, data) {

  info = find_limits(mapsample, data);
  mapsample.info = info;
  $('#date').text(date_text(info.first.properties.timestamp, info.last.properties.timestamp));
  colors = []
  geojsonLayer = L.geoJSON(data,
    {
      pointToLayer: function (feature, latlng) {
        var color = pick_color(feature.properties.p25);
        colors.push(color);
        return L.circleMarker(latlng, {
          fillColor: color,
          color: color,
          weight: 1,
          fillOpacity: 0.4,
          radius: 10
        }).on({
          mouseover: function (e) {
            $('#pm25_holder').text(show_info(feature.properties));
            $(".sample").css('background', color);
          },
          mouseout: function (e) {
            $('#pm25_holder').text('Pasa sobre el recorrido');
          }
        });
      }
    }
  );
  routeLine = L.polyline(data.map(function(val) { return val.geometry.coordinates.slice().reverse(); }));
  var bikeIcon = L.icon({
    iconUrl: '../images/marker-bike-green-shadowed.png',
    iconSize: [25, 39],
    iconAnchor: [12, 39],
    shadowUrl: null
  });
  var marker = L.animatedMarker(routeLine.getLatLngs(), {
    icon: bikeIcon,
    autoStart: true,
    onEnd: function() {
      $(this._shadow).fadeOut();
      $(this._icon).fadeOut(3000, function(){
        travelGroup.removeLayer(this);
        $(".sample").css('background', 'white');
      });
    },
    onTick: function(index) {
      $('#pm25_holder').text(show_info(data[this._i].properties));
      $(".sample").css('background', colors[this._i]);
    },
  });
  color = pick_color(info.first.properties.p25);

  /*
  * Hacer cálculo únicamente para el área que es
  * https://github.com/JoranBeaufort/Leaflet.idw
  * colocar como parámetro opcional el área de
  * interés
  */
  var points = data.map(function(val) {
    element = val.geometry.coordinates.slice().reverse();
    element.push(val.properties.p25);
    return element;
  });
  var heatLayer = L.idwLayer(points, {
    cellSize: 25,
    exp: 4,
    opacity: 0.5,
    max: 300,
    gradient: {0.16: 'green', 0.33: '#00DD00', 0.5: 'orange', 0.66: 'red', 0.8: '#800080', 1.0: 'brown' }
  });

  /*
  * Simplificar puntos
  * Generar grilla de hexágonos
  * Asignar valores de interpolación en los centros de los hexágonos
    * https://github.com/oeo4b/kriging.js
    * https://github.com/RaumZeit/MarchingSquares.js#computing-iso-bands
    * https://en.wikipedia.org/wiki/Marching_squares
  * Colocar colores a los hexágonos
  * Opción sin hexágonos: https://github.com/Turfjs/turf/issues/1034#issuecomment-338423286
  */

  var points = turf.featureCollection(data.map(function(val) {
    return turf.point(val.geometry.coordinates, { z: val.properties.p25 });
  }));
  var pointline = data.map(function(val){ return val.geometry.coordinates;});
  var line = turf.lineString(pointline)
  var options = {tolerance: 0.0005, highQuality: false, mutate: true};
  var simplified = turf.simplify(line, options);
  var distance = Math.round(turf.length(simplified, {units: 'kilometers'}) * 100) / 100;
  $('#interval').text('Entre ' + info.min + ' y ' + info.max + ' en ' +  distance + ' kilómetros');
  var buffered = turf.buffer(simplified, 150, {units: 'meters'});

  if (simplified.geometry.coordinates.length < 150) {
    options = {gridType: 'hex', property: 'z', units: 'meters'}
    var grid = turf.interpolate(points, 150, options)
    for (i=0; i < grid.features.length; i++) {
      centroid = turf.centroid(grid.features[i])
      if (turf.pointToLineDistance(turf.centroid(grid.features[i]), simplified) < 0.3) {
        L.geoJSON(grid.features[i], {style: function (feature) {
          return {fillOpacity: 0.8, color: pick_color(feature.properties.z)};
            }}).bindPopup(function (layer) {
              return ' ' + layer.feature.properties.z;
            }).addTo(interpolationGroup);
      }
    }
  }
  else {
    L.geoJSON(buffered).addTo(interpolationGroup);
  }
  marker.addTo(travelGroup);
  geojsonLayer.addTo(layerGroup);
  heatLayer.addTo(heatGroup);

  return geojsonLayer;
}

function load_canairio_layer(mapsample, layerGroup, travelGroup, heatGroup, interpolationGroup, filename) {
  $('.loader').show();
  var reference = 'data/' + filename + '.json';
  layerGroup.clearLayers();
  travelGroup.clearLayers();
  heatGroup.clearLayers();
  interpolationGroup.clearLayers();
  $('#filename').attr('href', reference);
  $.getJSON(reference)
    .done(function (data) {
      layer = configure_map(mapsample, layerGroup, travelGroup, heatGroup, interpolationGroup, data);
      mapsample.fitBounds(layer.getBounds());
      $('.loader').hide();
      mapsample.data = data;
    })
    .fail(function () { alert('No pudimos obtener los puntos, déjanos saber info@canair.io') });
}

function conventions_map(map) {
  var legend = L.control({ position: 'bottomright' });

  legend.onAdd = function (map) {
    var div = L.DomUtil.create('div', 'info legend'),
      grades = [0, 50, 100, 150, 200, 300],
      labels = [],
      from, to;
    for (var i = 0; i < grades.length; i++) {
      from = grades[i];
      to = grades[i + 1];

      labels.push(
        '<i style="background:' + pick_color(from + 1) + '"></i> ' +
        from + (to ? '&ndash;' + to : '+'));
    }
    labels.push('<i><a href="https://blissair.com/what-is-pm-2-5.htm">Meaning</a></i>');
    div.innerHTML = labels.join('<br>');
    return div;
  };
  legend.addTo(map);

  var info = L.control();

	info.onAdd = function (map) {
		this._div = L.DomUtil.create('div', 'info data');
		this._div.innerHTML = '<h4>Particulado</h4><i class="sample"></i><span id="pm25_holder">Pasa sobre el recorrido</span>';
		return this._div;
	};

  info.addTo(map);
  return info;
}

function getUrlParameter(sParam) {
  var sPageURL = window.location.search.substring(1),
      sURLVariables = sPageURL.split('&'),
      sParameterName,
      i;

  for (i = 0; i < sURLVariables.length; i++) {
      sParameterName = sURLVariables[i].split('=');

      if (sParameterName[0] === sParam) {
          return sParameterName[1] === undefined ? true : decodeURIComponent(sParameterName[1]);
      }
  }
};

function init_controls() {
  var data_references = [
    '20190502185441',
    '20190407191913',
    '20190403124450',
    '20190402112323',
    '20190327153956',
    '20190327141715',
    '20190323085459',
    '20190308180811',
    '20190227192004',
    '20190211183737',
  ];
  $('#select_map').html(function () {
    inner_data = '';
    data_references.forEach(element => {
      inner_data += '<option value="' + element + '">' + element.substr(0, 8) + '</option>'
    });
    return inner_data
  });

  var measurements = L.layerGroup();
  var travel = L.layerGroup();
  var heatmap = L.layerGroup();
  var interpolation = L.layerGroup();

  var base_layer = L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoiY2FuYWlyaW8iLCJhIjoiY2p2OXo3Y3VxMHlndjQ0bjMwajE4b2w2ZiJ9.ZfwXi-3Ald0O0AfpVvvm1g', {
    maxZoom: 18,
    attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
      '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
      'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
    id: 'mapbox.streets'
  });
  var mapsample = L.map('mapid', {
    center: [4.60, -74.13],
    zoom: 14,
    layers: [base_layer, measurements, interpolation],
  });

  var info = conventions_map(mapsample);
  $('#select_map').change(function () {
    track_name = $(this).val();
    load_canairio_layer(mapsample, measurements, travel, heatmap, interpolation, track_name);
  });

  track_name = getUrlParameter('track_name') || data_references[0]
  load_canairio_layer(mapsample, measurements, travel, heatmap, interpolation, track_name);
  L.control.layers(null, {
    "Recorrido": measurements,
    "Animación": travel,
    "IDW": heatmap,
    "Interpolación": interpolation
  }).addTo(mapsample);
  return mapsample;
}