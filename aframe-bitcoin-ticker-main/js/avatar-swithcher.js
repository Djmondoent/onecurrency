AFRAME.registerComponent('avatar-switcher', {
  init: function () {
    this.el.addEventListener('click', function (evt) {
      // Get the ID of the clicked entity
      var clickedEntityId = evt.detail.intersectedEl.id;

      // Check if the clicked entity is a male or female avatar
      if (clickedEntityId === 'male-avatar') {
        // Destroy the current player entity
        var playerEntity = document.querySelector('#player');
        playerEntity.parentNode.removeChild(playerEntity);

        // Create a new player entity with the male avatar model
        var newPlayerEntity = document.createElement('a-entity');
        newPlayerEntity.setAttribute('id', 'player');
        newPlayerEntity.innerHTML = `
          <a-camera
            id="head"
            near="0.1"
            raycaster="far: 20; interval: 10; objects: .clickable"
            wasd-controls="fly: false"
            look-controls
            networked-audio-source=""
            rotation="0 180 0"
            animation="property: rotation; from: 0 190 0 to: 0 -360 0; dur: 1000; delay: 2000; easing: easeInQuad; loop: false"
            position="0 1.6 0"
            avatar-changer
          >
          </a-camera>

          <a-entity
            id="leftHand"
            tracked-controls="hand: left"
            cursor
            raycaster="far: 20; interval: 1000; objects: .clickable"
          ></a-entity>
          <a-entity
            id="rightHand"
            tracked-controls="hand: right"
            cursor
            raycaster="far: 20; interval: 1000; objects: .clickable"
          ></a-entity>
        `;
        document.querySelector('a-scene').appendChild(newPlayerEntity);

        // Update the camera rig to use the new player entity
        var cameraRig = document.querySelector('#cameraRig');
        cameraRig.setAttribute('camera-rig', 'player', '#player');
      } else if (clickedEntityId === 'female-avatar') {
        // Destroy the current player entity
        var playerEntity = document.querySelector('#player');
        playerEntity.parentNode.removeChild(playerEntity);

        // Create a new player entity with the female avatar model
        var newPlayerEntity = document.createElement('a-entity');
        newPlayerEntity.setAttribute('id', 'player');
        newPlayerEntity.innerHTML = `
          <a-camera
            id="head"
            near="0.1"
            raycaster="far: 20; interval: 10; objects: .clickable"
            wasd-controls="fly: false"
            look-controls
            networked-audio-source=""
            rotation="0 180 0"
            animation="property: rotation; from: 0 190 0 to: 0 -360 0; dur: 1000; delay: 2000; easing: easeInQuad; loop: false"
            position="0 1.6 0"
            avatar-changer
          >
          </a-camera>

          <a-entity
            id="leftHand"
            tracked-controls="hand: left"
            cursor
            raycaster="far: 20; interval: 1000; objects: .clickable"
          ></a-entity>
          <a-entity
            id="rightHand"
            tracked-controls="hand: right"
            cursor
            raycaster="far: 20; interval: 1000; objects: .clickable"
          ></a-entity>
       


      