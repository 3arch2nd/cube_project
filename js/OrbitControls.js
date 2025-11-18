/**
 * @author qiao / https://github.com/qiao
 * @author mrdoob / http://mrdoob.com
 * @author alteredq / http://alteredqualia.com/
 * @author WestLangley / http://github.com/WestLangley
 * @author erich666 / http://erichbraun.com
 */

// This set of controls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction 
// (which is by default the Y-axis) -- 
// meaning that orbiting over the poles will not flip the bit.

THREE.OrbitControls = function ( object, domElement ) {

	this.object = object;
	this.domElement = ( domElement !== undefined ) ? domElement : document;

	// Set to false to disable this control
	this.enabled = true;

	// "target" sets the location of focus, not the camera's position.
	// The camera moves around the target.
	this.target = new THREE.Vector3();

	// How far you can dolly in and out (PerspectiveCamera only)
	this.minDistance = 0;
	this.maxDistance = Infinity;

	// How far you can zoom in and out (OrthographicCamera only)
	this.minZoom = 0;
	this.maxZoom = Infinity;

	// How far you can orbit vertically, upper and lower limits.
	// Range is 0 to Math.PI radians.
	this.minPolarAngle = 0; // radians
	this.maxPolarAngle = Math.PI; // radians

	// How far you can orbit horizontally, left and right limits.
	// If set, must be a sub-interval of the interval [ - Math.PI, Math.PI ].
	this.minAzimuthAngle = - Infinity; // radians
	this.maxAzimuthAngle = Infinity; // radians

	// Set to true to enable damping (inertia)
	// If damping is enabled, you must call controls.update() in your animation loop
	this.enableDamping = false;
	this.dampingFactor = 0.25;

	// This one is not implemented yet
	this.enableKeys = false;

	// Set to false to disable zooming (dollying) and panning
	this.enableZoom = true;
	this.zoomSpeed = 1.0;

	this.enablePan = true;
	this.keyPanSpeed = 7.0;	// pixels per key press

	// Set to true to automatically rotate around the target
	// If controls.autoRotate is set to true, you must call controls.update() in your animation loop
	this.autoRotate = false;
	this.autoRotateSpeed = 2.0; // 30 seconds per round when at 60fps

	// Set to false to disable use of the keys
	this.enableKeys = true;
	this.keys = { LEFT: 37, UP: 38, RIGHT: 39, BOTTOM: 40 };

	// Mouse buttons
	this.mouseButtons = { ORBIT: THREE.MOUSE.LEFT, ZOOM: THREE.MOUSE.MIDDLE, PAN: THREE.MOUSE.RIGHT };

	//
	// public methods
	//

	this.getPolarAngle = function () {

		return spherical.phi;

	};

	this.getAzimuthalAngle = function () {

		return spherical.theta;

	};

	this.dispose = function() {

		this.domElement.removeEventListener( 'contextmenu', contextmenu, false );
		this.domElement.removeEventListener( 'mousedown', onMouseDown, false );
		this.domElement.removeEventListener( 'mousewheel', onMouseWheel, false );
		this.domElement.removeEventListener( 'MozMousePixelScroll', onMouseWheel, false ); // firefox

		this.domElement.removeEventListener( 'touchstart', touchstart, false );
		this.domElement.removeEventListener( 'touchend', touchend, false );
		this.domElement.removeEventListener( 'touchmove', touchmove, false );

		document.removeEventListener( 'mousemove', onMouseMove, false );
		document.removeEventListener( 'mouseup', onMouseUp, false );

		window.removeEventListener( 'keydown', onKeyDown, false );

		//this.dispatchEvent( { type: 'dispose' } ); // should we just call update once after dispose

	};

	//
	// internals
	//

	var scope = this;

	var changeEvent = { type: 'change' };
	var startEvent = { type: 'start' };
	var endEvent = { type: 'end' };

	var STATE = { NONE : - 1, ROTATE : 0, DOLLY : 1, PAN : 2, TOUCH_ROTATE : 3, TOUCH_DOLLY : 4, TOUCH_PAN : 5 };

	var state = STATE.NONE;

	var EPS = 0.000001;

	// current position in spherical coordinates
	var spherical = new THREE.Spherical();
	var sphericalDelta = new THREE.Spherical();

	var scale = 1;
	var panOffset = new THREE.Vector3();
	var zoomChanged = false;

	var rotateStart = new THREE.Vector2();
	var rotateEnd = new THREE.Vector2();
	var rotateDelta = new THREE.Vector2();

	var panStart = new THREE.Vector2();
	var panEnd = new THREE.Vector2();
	var panDelta = new THREE.Vector2();

	var dollyStart = new THREE.Vector2();
	var dollyEnd = new THREE.Vector2();
	var dollyDelta = new THREE.Vector2();

	function getAutoRotationAngle() {

		return 2 * Math.PI / 60 / 60 * scope.autoRotateSpeed;

	}

	function getZoomScale() {

		return Math.pow( 0.95, scope.zoomSpeed );

	}

	function rotateLeft( angle ) {

		sphericalDelta.theta -= angle;

	}

	function rotateUp( angle ) {

		sphericalDelta.phi -= angle;

	}

	var panLeft = function() {

		var v = new THREE.Vector3();

		return function panLeft( distance, objectMatrix ) {

			v.setFromMatrixColumn( objectMatrix, 0 ); // get X column of objectMatrix
			v.multiplyScalar( - distance );

			panOffset.add( v );

		};

	}();

	var panUp = function() {

		var v = new THREE.Vector3();

		return function panUp( distance, objectMatrix ) {

			v.setFromMatrixColumn( objectMatrix, 1 ); // get Y column of objectMatrix
			v.multiplyScalar( distance );

			panOffset.add( v );

		};

	}();

	// To do: implement key navigation in screen space

	this.pan = function ( deltaX, deltaY ) {

		var element = scope.domElement === document ? scope.domElement.body : scope.domElement;

		if ( scope.object.perspective ) {

			// perspective

			var position = scope.object.position;
			var offset = position.clone().sub( scope.target );
			var targetDistance = offset.length();

			// half of the fov is center to top of screen
			targetDistance *= Math.tan( ( scope.object.fov / 2 ) * Math.PI / 180.0 );

			// we actually don't use screen width here, since the screen can be any aspect ratio
			panLeft( 2 * deltaX * targetDistance / element.clientHeight, scope.object.matrix );
			panUp( 2 * deltaY * targetDistance / element.clientHeight, scope.object.matrix );

		} else if ( scope.object.orthographic ) {

			// orthographic

			panLeft( deltaX * ( scope.object.right - scope.object.left ) / scope.object.zoom / element.clientWidth, scope.object.matrix );
			panUp( deltaY * ( scope.object.top - scope.object.bottom ) / scope.object.zoom / element.clientHeight, scope.object.matrix );

		} else {

			// camera neither orthographic nor perspective
			console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.' );
			scope.enablePan = false;

		}

	};

	this.dollyIn = function ( dollyScale ) {

		if ( scope.object.perspective ) {

			scale /= dollyScale;

		} else if ( scope.object.orthographic ) {

			scope.object.zoom = Math.max( scope.minZoom, Math.min( scope.maxZoom, scope.object.zoom * dollyScale ) );
			scope.object.updateProjectionMatrix();
			zoomChanged = true;

		} else {

			console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
			scope.enableZoom = false;

		}

	};

	this.dollyOut = function ( dollyScale ) {

		if ( scope.object.perspective ) {

			scale *= dollyScale;

		} else if ( scope.object.orthographic ) {

			scope.object.zoom = Math.max( scope.minZoom, Math.min( scope.maxZoom, scope.object.zoom / dollyScale ) );
			scope.object.updateProjectionMatrix();
			zoomChanged = true;

		} else {

			console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
			scope.enableZoom = false;

		}

	};

	this.update = function () {

		var offset = new THREE.Vector3();

		// so camera.up is the orbit axis
		var quat = new THREE.Quaternion().setFromUnitVectors( object.up, new THREE.Vector3( 0, 1, 0 ) );
		var quatInverse = quat.clone().inverse();

		var lastPosition = new THREE.Vector3();
		var lastQuaternion = new THREE.Quaternion();

		return function update() {

			var position = scope.object.position;

			offset.copy( position ).sub( scope.target );

			// rotate offset to "y-up" space
			offset.applyQuaternion( quat );

			// angle from z-axis around y-axis
			spherical.setFromVector3( offset );

			if ( scope.autoRotate && state === STATE.NONE ) {

				rotateLeft( getAutoRotationAngle() );

			}

			spherical.theta += sphericalDelta.theta;
			spherical.phi += sphericalDelta.phi;

			// restrict theta to be between desired limits
			spherical.theta = Math.max( scope.minAzimuthAngle, Math.min( scope.maxAzimuthAngle, spherical.theta ) );

			// restrict phi to be between desired limits
			spherical.phi = Math.max( scope.minPolarAngle, Math.min( scope.maxPolarAngle, spherical.phi ) );

			spherical.makeSafe();


			// move target to panned location
			scope.target.add( panOffset );

			offset.setFromSpherical( spherical );

			// rotate offset back to "camera up" space
			offset.applyQuaternion( quatInverse );

			position.copy( scope.target ).add( offset );

			scope.object.lookAt( scope.target );

			if ( scope.enableDamping === true ) {

				sphericalDelta.theta *= ( 1 - scope.dampingFactor );
				sphericalDelta.phi *= ( 1 - scope.dampingFactor );

			} else {

				sphericalDelta.set( 0, 0, 0 );

			}

			panOffset.set( 0, 0, 0 );

			//

			if ( lastPosition.distanceTo( scope.object.position ) * lastPosition.distanceTo( scope.object.position ) > EPS || // ✨ 수정 1: distanceSq 대신 distanceTo 제곱 사용
				 lastQuaternion.angleTo( scope.object.quaternion ) > EPS ||
				 zoomChanged ) {

				scope.dispatchEvent( changeEvent );

				lastPosition.copy( scope.object.position );
				lastQuaternion.copy( scope.object.quaternion );
				zoomChanged = false;

				return true;

			}

			return false;

		};

	}();

	this.reset = function () {

		state = STATE.NONE;

		scope.target.copy( scope.target0 );
		scope.object.position.copy( scope.position0 );
		scope.object.zoom = scope.zoom0;

		scope.object.updateProjectionMatrix();
		scope.dispatchEvent( changeEvent );

		this.update();

	};

	// backward compatibility
	this.keys = this.keys;


	this.getMouseOnScreen = function ( clientX, clientY ) {

		var element = scope.domElement === document ? scope.domElement.body : scope.domElement;

		return new THREE.Vector2(
			( clientX - _this.domElement.offsetLeft ) / element.clientWidth,
			( clientY - _this.domElement.offsetTop ) / element.clientHeight
		);

	};

	this.getMouseProjectionOnPlane = function ( clientX, clientY ) {

		var mouseOnScreen = new THREE.Vector2(
			( clientX - _this.domElement.offsetLeft ) / _this.domElement.clientWidth,
			( clientY - _this.domElement.offsetTop ) / _this.domElement.clientHeight
		);

		var vector = new THREE.Vector3(
			( mouseOnScreen.x - 0.5 ) * 2,
			( mouseOnScreen.y - 0.5 ) * 2,
			0.5
		);

		vector.unproject( scope.object );

		var projection = new THREE.Vector3(),
			direction = new THREE.Vector3().subVectors( vector, scope.object.position ),
			distance;

		if ( scope.object.perspective ) {

			direction.normalize();
			distance = - scope.object.position.dot( projection ) / direction.dot( projection );

		} else if ( scope.object.orthographic ) {

			distance = -( vector.z / projection.z );

		}

		return scope.object.position.clone().add( direction.multiplyScalar( distance ) );

	};

	function onMouseDown( event ) {

		if ( scope.enabled === false ) return;

		event.preventDefault();

		if ( event.button === scope.mouseButtons.ORBIT ) {

			if ( scope.enableRotate === false ) return;

			state = STATE.ROTATE;

			rotateStart.set( event.clientX, event.clientY );

		} else if ( event.button === scope.mouseButtons.ZOOM ) {

			if ( scope.enableZoom === false ) return;

			state = STATE.DOLLY;

			dollyStart.set( event.clientX, event.clientY );

		} else if ( event.button === scope.mouseButtons.PAN ) {

			if ( scope.enablePan === false ) return;

			state = STATE.PAN;

			panStart.set( event.clientX, event.clientY );

		}

		if ( state !== STATE.NONE ) {

			document.addEventListener( 'mousemove', onMouseMove, false );
			document.addEventListener( 'mouseup', onMouseUp, false );
			scope.dispatchEvent( startEvent );

		}

	}

	function onMouseMove( event ) {

		if ( scope.enabled === false ) return;

		event.preventDefault();

		var element = scope.domElement === document ? scope.domElement.body : scope.domElement;

		if ( state === STATE.ROTATE ) {

			if ( scope.enableRotate === false ) return;

			rotateEnd.set( event.clientX, event.clientY );
			rotateDelta.subVectors( rotateEnd, rotateStart );

			// rotating across whole screen goes 360 degrees around
			scope.rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientWidth * scope.userRotateSpeed );

			// rotating up and down along whole screen goes 180 degrees (half of sphere)
			scope.rotateUp( 2 * Math.PI * rotateDelta.y / element.clientHeight * scope.userRotateSpeed );

			rotateStart.copy( rotateEnd );

			scope.update();

		} else if ( state === STATE.DOLLY ) {

			if ( scope.enableZoom === false ) return;

			dollyEnd.set( event.clientX, event.clientY );
			dollyDelta.subVectors( dollyEnd, dollyStart );

			if ( dollyDelta.y > 0 ) {

				scope.dollyIn( getZoomScale() );

			} else if ( dollyDelta.y < 0 ) {

				scope.dollyOut( getZoomScale() );

			}

			dollyStart.copy( dollyEnd );

			scope.update();

		} else if ( state === STATE.PAN ) {

			if ( scope.enablePan === false ) return;

			panEnd.set( event.clientX, event.clientY );
			panDelta.subVectors( panEnd, panStart );

			scope.pan( panDelta.x, panDelta.y );

			panStart.copy( panEnd );

			scope.update();

		}

	}

	function onMouseUp( /* event */ ) {

		if ( scope.enabled === false ) return;

		document.removeEventListener( 'mousemove', onMouseMove, false );
		document.removeEventListener( 'mouseup', onMouseUp, false );
		scope.dispatchEvent( endEvent );

		state = STATE.NONE;

	}

	function onMouseWheel( event ) {

		if ( scope.enabled === false || scope.enableZoom === false || state !== STATE.NONE ) return;

		event.preventDefault();
		event.stopPropagation();

		var delta = 0;

		if ( event.wheelDelta !== undefined ) { // WebKit / Opera / Explorer 9

			delta = event.wheelDelta;

		} else if ( event.detail !== undefined ) { // Firefox

			delta = - event.detail;

		}

		if ( delta > 0 ) {

			scope.dollyOut( getZoomScale() );

		} else if ( delta < 0 ) {

			scope.dollyIn( getZoomScale() );

		}

		scope.update();
		scope.dispatchEvent( startEvent ); // not sure why these are here...
		scope.dispatchEvent( endEvent );

	}

	function onKeyDown( event ) {

		if ( scope.enabled === false || scope.enableKeys === false || scope.enablePan === false ) return;

		switch ( event.keyCode ) {

			case scope.keys.UP:
				scope.pan( 0, scope.keyPanSpeed );
				scope.update();
				break;

			case scope.keys.BOTTOM:
				scope.pan( 0, - scope.keyPanSpeed );
				scope.update();
				break;

			case scope.keys.LEFT:
				scope.pan( scope.keyPanSpeed, 0 );
				scope.update();
				break;

			case scope.keys.RIGHT:
				scope.pan( - scope.keyPanSpeed, 0 );
				scope.update();
				break;

		}

	}

	function touchstart( event ) {

		if ( scope.enabled === false ) return;

		switch ( event.touches.length ) {

			case 1:	// one-fingered touch: rotate
				if ( scope.enableRotate === false ) return;

				state = STATE.TOUCH_ROTATE;

				rotateStart.set( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
				break;

			case 2:	// two-fingered touch: dolly
				if ( scope.enableZoom === false ) return;

				state = STATE.TOUCH_DOLLY;

				var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
				var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
				var distance = Math.sqrt( dx * dx + dy * dy );
				dollyStart.set( 0, distance );
				break;

			case 3: // three-fingered touch: pan
				if ( scope.enablePan === false ) return;

				state = STATE.TOUCH_PAN;

				panStart.set( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
				break;

			default:
				state = STATE.NONE;

		}

		if ( state !== STATE.NONE ) {

			scope.dispatchEvent( startEvent );

		}

	}

	function touchmove( event ) {

		if ( scope.enabled === false ) return;

		event.preventDefault();
		event.stopPropagation();

		var element = scope.domElement === document ? scope.domElement.body : scope.domElement;

		switch ( event.touches.length ) {

			case 1: // one-fingered touch: rotate
				if ( scope.enableRotate === false ) return;
				if ( state !== STATE.TOUCH_ROTATE ) return;

				rotateEnd.set( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
				rotateDelta.subVectors( rotateEnd, rotateStart );

				// rotating across whole screen goes 360 degrees around
				scope.rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientWidth * scope.userRotateSpeed );

				// rotating up and down along whole screen goes 180 degrees (half of sphere)
				scope.rotateUp( 2 * Math.PI * rotateDelta.y / element.clientHeight * scope.userRotateSpeed );

				rotateStart.copy( rotateEnd );

				scope.update();
				break;

			case 2: // two-fingered touch: dolly
				if ( scope.enableZoom === false ) return;
				if ( state !== STATE.TOUCH_DOLLY ) return;

				var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
				var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
				var distance = Math.sqrt( dx * dx + dy * dy );

				dollyEnd.set( 0, distance );
				dollyDelta.subVectors( dollyEnd, dollyStart );

				if ( dollyDelta.y > 0 ) {

					scope.dollyOut( getZoomScale() );

				} else if ( dollyDelta.y < 0 ) {

					scope.dollyIn( getZoomScale() );

				}

				dollyStart.copy( dollyEnd );

				scope.update();
				break;

			case 3: // three-fingered touch: pan
				if ( scope.enablePan === false ) return;
				if ( state !== STATE.TOUCH_PAN ) return;

				panEnd.set( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
				panDelta.subVectors( panEnd, panStart );

				scope.pan( panDelta.x, panDelta.y );

				panStart.copy( panEnd );

				scope.update();
				break;

			default:
				state = STATE.NONE;

		}

	}

	function touchend( event ) {

		if ( scope.enabled === false ) return;

		scope.dispatchEvent( endEvent );

		state = STATE.NONE;

	}

	function contextmenu( event ) {

		event.preventDefault();

	}

	this.domElement.addEventListener( 'contextmenu', contextmenu, false );

	this.domElement.addEventListener( 'mousedown', onMouseDown, false );
	this.domElement.addEventListener( 'mousewheel', onMouseWheel, false );
	this.domElement.addEventListener( 'MozMousePixelScroll', onMouseWheel, false ); // firefox

	this.domElement.addEventListener( 'touchstart', touchstart, false );
	this.domElement.addEventListener( 'touchend', touchend, false );
	this.domElement.addEventListener( 'touchmove', touchmove, false );

	window.addEventListener( 'keydown', onKeyDown, false );

	// force an update at start
	// this.update(); // ❌ 수정 2: 초기화 시점의 오류를 방지하기 위해 이 줄을 삭제합니다. (FoldEngine에서 호출)

};

THREE.OrbitControls.prototype = Object.create( THREE.EventDispatcher.prototype );
THREE.OrbitControls.prototype.constructor = THREE.OrbitControls;

Object.defineProperties( THREE.OrbitControls.prototype, {

	target0: {
		get: function () {
			return this.target.clone();
		},
		set: function ( value ) {
			this.target.copy( value );
			this.target0.copy( value );
		}
	},

	position0: {
		get: function () {
			return this.object.position.clone();
		},
		set: function ( value ) {
			this.object.position.copy( value );
			this.position0.copy( value );
		}
	},

	zoom0: {
		get: function () {
			return this.object.zoom;
		},
		set: function ( value ) {
			this.object.zoom = value;
			this.zoom0 = value;
		}
	}
} );
