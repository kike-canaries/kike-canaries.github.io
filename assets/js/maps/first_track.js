
function find_limits(data) {
  var min = Infinity;
  var max = -Infinity;
  var first_sample = data[0];
  var last_sample = data[data.length - 1];
  for (var feature in data) {
    var properties = data[feature].properties;
    if (properties.p25 < min) {
      min = properties.p25;
    }
    else if (properties.p25 > max) {
      max = properties.p25;
    }
  }

  return {
    min: min,
    max: max,
    first: first_sample,
    last: last_sample
  };
}

function linear_interpolation(ar, ag, ab, br, bg, bb, t) {
  return 'rgb(' +
    Math.round(ar + (br - ar) * t) + ',' +
    Math.round(ag + (bg - ag) * t) + ',' +
    Math.round(ab + (bb - ab) * t) + ')';
}

function pick_color(value) {
  if (value <= 12) {
    return linear_interpolation(5, 141, 5, 30, 161, 15, value / 12);
  }
  else if (value <= 35.4) {
    return linear_interpolation(250, 250, 1, 247, 240, 16, value / 35.4);
  }
  else if (value <= 55.4) {
    return linear_interpolation(250, 150, 0, 255, 69, 0, value / 55);
  }
  else if (value <= 150.4) {
    return linear_interpolation(255, 51, 51, 204, 0, 0, value / 150);
  }
  else if (value <= 250) {
    return linear_interpolation(153, 76, 0, 56, 44, 30, value / 250);
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

function configure_map(layerGroup, data) {

  info = find_limits(data);
  $('#interval').text('Entre ' + info.min + ' y ' + info.max);
  $('#date').text(date_text(info.first.properties.timestamp, info.last.properties.timestamp));
  var start_marker = L.marker([info.first.geometry.coordinates[1], info.first.geometry.coordinates[0]], { icon: L.icon.glyph({ prefix: '', cssClass: 'sans-serif', glyph: '&alpha;' }) });
  var end_marker = L.marker([info.last.geometry.coordinates[1], info.last.geometry.coordinates[0]], { icon: L.icon.glyph({ prefix: '', cssClass: 'sans-serif', glyph: '&Omega;' }) });
  geojsonLayer = L.geoJSON(data,
    {
      pointToLayer: function (feature, latlng) {
        var color = pick_color(feature.properties.p25);
        return L.circleMarker(latlng, {
          fillColor: color,
          color: color,
          weight: 1,
          fillOpacity: 0.6,
          radius: 3 + Math.min(20, 20 * feature.properties.p25 / (info.max - info.min))
        }).on({
          mouseover: function (e) {
            $('#pm25_holder').text(show_info(feature.properties));
          },
          mouseout: function (e) {
            $('#pm25_holder').text('Pasa sobre el recorrido');
          }
        });
      }
    }
  );
  start_marker.addTo(geojsonLayer);
  end_marker.addTo(geojsonLayer);
  geojsonLayer.addTo(layerGroup);
  return geojsonLayer;
}

function load_canairio_layer(mapsample, layerGroup, filename) {
  $('.loader').show();
  var reference = 'data/' + filename + '.json';
  layerGroup.clearLayers();
  $('#filename').attr('href', reference);
  $.getJSON(reference)
    .done(function (data) {
      layer = configure_map(layerGroup, data);
      mapsample.fitBounds(layer.getBounds());
      $('.loader').hide();
    })
    .fail(function () { alert('No pudimos obtener los puntos, déjanos saber info@canair.io') });
}

function roundNumber(inNumber) {
  return (Math.round(inNumber / 10) * 10);
}

function calcPropRadius(attributeValue) {
  var scaleFactor = 16;
  var area = attributeValue * scaleFactor;
  return Math.sqrt(area / Math.PI) * 2;
}

function conventions_map(map) {
  var legend = L.control({ position: 'bottomright' });

  legend.onAdd = function (map) {
    var div = L.DomUtil.create('div', 'info legend'),
      grades = [0, 12, 35.4, 55.4, 150.4, 250.4],
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
		this._div.innerHTML = '<h4>Particulado</h4><span id="pm25_holder">Pasa sobre el recorrido</span>';
		return this._div;
	};

  info.addTo(map);
  return info;
}