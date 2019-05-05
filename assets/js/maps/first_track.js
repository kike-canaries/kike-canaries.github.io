
function find_limits(data) {
  var min = Infinity; 
  var max = -Infinity;
  for (var feature in data) {
    var properties = data[feature].properties;
    if (properties.p25 < min){
      min = properties.p25;
    }
    else if(properties.p25 > max) {
      max = properties.p25;
    }
  }
  return {
    min: min,
    max: max
  };
}

function linear_interpolation(ar, ag, ab, br, bg, bb, t){
  return 'rgb(' +
    Math.round(ar + (br - ar) * t) + ',' +
    Math.round(ag + (bg - ag) * t) + ',' +
    Math.round(ab + (bb - ab) * t) + ')';
}

function pick_color(value) {
  if(value <= 12) {
    return linear_interpolation(5, 141, 5, 30,161,15, value/12);
  }
  else if(value <= 35.4) {
    return linear_interpolation(250,250,1,247,240,16,value/35.4);
  }
  else if (value <= 55.4) {
    return linear_interpolation(250,150,0,255, 69, 0,value/55);
  }
  else if (value <= 150.4) {
    return linear_interpolation(255,51,51,204,0,0,value/150);
  }
  else if (value <= 250 ) {
    return linear_interpolation(153, 76, 0,56,44,30,value/250);
  }
  return linear_interpolation(56,44,30,0,0,0,Math.min(1,value/500));
}


function configure_map(mapsample, layerGroup, data) {
   
  info = find_limits(data);
  console.log('Entre ' + info.min + ' y ' + info.max);
  $('#interval').text('Entre ' + info.min + ' y ' + info.max );

  geojsonLayer = L.geoJSON(data,
    {		
      pointToLayer: function(feature, latlng) {	
        var color = pick_color(feature.properties.p25);  
        return L.circleMarker(latlng, { 
          fillColor: color,
          color: color,
          weight: 1, 
          fillOpacity: 0.6 
        }).on({
          mouseover: function(e) {
            $('#pm25_holder').text(feature.properties.p25 + ' ' + new Date(feature.properties.timestamp * 1000));
          },
          mouseout: function(e) {
            $('#pm25_holder').text('');
          }
        });
      }
    }
  );
  var popup = L.popup();
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
    the_date = new Date(data[0].properties.timestamp * 1000);
    $('#date').text(the_date);
    layer = configure_map(mapsample, layerGroup, data);
    mapsample.fitBounds(layer.getBounds());
    $('.loader').hide();
  })
  .fail(function () { alert('No pudimos obtener los puntos, déjanos saber info@canair.io') });
}