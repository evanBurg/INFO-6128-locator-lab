let state = {
  navigator: null,
  mapDiv: null,
  map: null,
  locateBtn: null,
  clearBtn: null,
  stopBtn: null,
  markers: [],
  startAtLastLocation: false,
};

const askStartHere = async (coords) => {
  const { startHere, latlng } = (await localforage.getItem('startAtLastLocation')) || { };
  if (startHere && latlng) {
    return state.startAtLastLocation = true;
  }

  const answer = await ons.notification.confirm('Do you wish to start the application at this location in the future?', {
    buttonLabels: ["No.", "Yes please!"]
  });

  if (answer === 1) {
    state.startAtLastLocation = true;
    localforage.setItem('startAtLastLocation', { startHere: true, latlng: coords });
  } else {
    localforage.setItem('startAtLastLocation', { startHere: false, latlng: undefined });
  }
}

const onLocateSuccess = (position) => {
  const { coords } = position;
  const leafletCoords = { lat: coords.latitude, lon: coords.longitude };
  state.map.setView(leafletCoords, 12);
  setTimeout(() => askStartHere(leafletCoords), 500);
};

const errors = {
  1: '[PERMISSION_DENIED] Permission was denied to access location services.',
  2: '[POSITION_UNAVAILABLE] The GPS was not able to determine a location',
  3: '[TIMEOUT] The GPS failed to determine a location within the timeout duration',
};

const onLocateFailure = (error) => {
  console.error('Could not access location services!');
  console.error('errors[error.code]', errors[error.code]);
  console.error('error.message', error.message);
};

const locate = () => {
  if (!navigator.geolocation) {
    console.log('Geolocation is not supported by your browser');
  } else {
    navigator.geolocation.getCurrentPosition(onLocateSuccess, onLocateFailure);
  }
};

const listenInterval = () => {
  if (!navigator.geolocation) {
    console.log('Geolocation is not supported by your browser');
  } else {
    state.listenTimerID = setInterval(locate, 750);
  }
};

const listen = () => {
  if (!navigator.geolocation) {
    console.log('Geolocation is not supported by your browser');
  } else {
    const options = {
      enableHighAccuracy: false,
      maximumAge: 0,
      timeout: 5000,
    };
    state.shouldListen = true;
    stopListening(state.shouldListen);
    state.listenTimerID = navigator.geolocation.watchPosition(onLocateSuccess, onLocateFailure, options);
  }
};

const stopListening = () => {
  if (!navigator.geolocation) {
    console.log('Geolocation is not supported by your browser');
  } else {
    if (state.listenTimerID) {
      navigator.geolocation.clearWatch(state.listenTimerID);
      clearInterval(state.listenTimerID);
    }
  }
};

const clearSingleMarker = (lat, lng, title) => {
  try {
    console.log('clearSingleMarker', lat, lng, title);
    const mrkrIdx = state.markers.findIndex((m) => {
      return m.lat === lat && m.lng === lng && m.title === title;
    });
    if (mrkrIdx > -1) {
      state.markers[mrkrIdx].instance.remove();
      state.markers.splice(mrkrIdx, 1);
      saveState();
    }
  } catch (e) {
    console.log('Could not clear single marker', e);
  }
};

const clearAllMarkers = () => {
  state.markers.forEach((m) => m.instance.remove());
  state.markers = [];
  saveState();
};

const createMarker = (latlng, title) => {
  const themedIcon = new L.Icon({
    iconUrl: 'https://chart.googleapis.com/chart?chst=d_map_pin_icon&chld=home%7C001219',
    iconSize: [21, 34],
    popupAnchor: [0, -15],
  });
  return L.marker(latlng, { icon: themedIcon })
    .bindPopup(`
        <h3>${title}</h3>
        <ons-button modifier="large" onclick="clearSingleMarker(${latlng.lat}, ${latlng.lng}, '${title}')">Remove</ons-button>
    `)
    .addTo(state.map);
}

const mapClick = async (e) => {
  try {
    const answer = await ons.notification.prompt('To place a marker here, please enter a title:', {
      buttonLabels: ["Cancel", "Confirm"],
      defaultValue: false,
    });
    
    if (!answer) {
      return ons.notification.toast("Cancelled marker creation.", {
        timeout: 750
      });
    }

    const newMarker = createMarker(e.latlng, answer);
    state.markers.push({
      ...e.latlng,
      title: answer,
      instance: newMarker,
    });
    saveState();
  } catch (e) {
    console.log('Could not add marker to the map', e);
  }
};

const saveState = async () => {
  const dataToSave = state.markers.map(m => ({ ...m, instance: undefined }));
  try {
    await localforage.setItem('markers', dataToSave);
  } catch(e) {
    console.log('Could not save data', e);
  }
}

const loadState = async () => {
  try {
    const data = await localforage.getItem('markers');
    if (data && Array.isArray(data)) {
      state.markers = data.map(m => ({
        ...m,
        instance: createMarker(m, m.title),
      }));
    }
  } catch(e) {
    console.log('Could not load data', e);
  }
}

const initMap = async () => {
  // London area
  // 42.9758025, -81.244782, 13.25z
  try {
    const { startHere, latlng } = (await localforage.getItem('startAtLastLocation')) || { };
    let map;
    if (startHere && latlng) {
      map = L.map('map').setView(latlng, 12);
    } else {
      map = L.map('map').setView({ lon: -81.244782, lat: 42.9758025 }, 13.25);
    }
    map.on('click', mapClick);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);
    L.control.scale({ imperial: false, metric: true }).addTo(map);
    return map;
  } catch (e) {
    console.log('Could not initiate the map', e);
  }
};

const setUpPage = async (evt) => {
  if (evt.target.id === 'home') {
    state = {
      navigator: document.querySelector('#navigator'),
      mapDiv: document.querySelector('#map'),
      map: await initMap(),
      locateBtn: document.querySelector('#locateBtn'),
      clearBtn: document.querySelector('#clearBtn'),
      markers: [],
    };
    if (!ons.platform.isAndroid()) {
      state.mapDiv.classList.add('ios');
    }
    state.locateBtn.addEventListener('click', locate);
    state.clearBtn.addEventListener('click', clearAllMarkers);
  }
  loadState();
};

document.addEventListener('init', setUpPage);
