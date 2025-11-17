/**
 * foldEngine.js
 *
 * Three.js로 전개도(6면)를 만들고
 * adjacency(좌/우/상/하)에 따라 face를 parent-child 구조로 연결한 뒤
 * 90도씩 회전시키며 정육면체로 접는 애니메이션을 구현.
 *
 * 외부에서 사용하는 주요 함수:
 *
 *   FoldEngine.init(canvasDom)
 *   FoldEngine.loadNet(net)
 *   FoldEngine.unfoldImmediate()
 *   FoldEngine.foldAnimate(duration)
 *
 */

(function () {
    'use strict';

    const FoldEngine = {};
    window.FoldEngine = FoldEngine;

    // Three.js 기본 구성 요소
    let scene, camera, renderer;
    let rootGroup;          // 모든 면을 담는 최상위 그룹
    let faceGroups = [];    // faces[i]에 해당하는 그룹
    let clock;

    // 애니메이션용 플래그
    let animating = false;

    // 각 face가 최종적으로 회전해야 하는 target angle
    // net adjacency 기반으로 설정됨
    const faceTargetRotation = [];

    /** ================================
     *  Three.js 초기화
     * ================================ */
    FoldEngine.init = function (canvas) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);

        camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
        camera.position.set(2.8, 2.2, 3.2);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);

        clock = new THREE.Clock();

        animate();
    };

    /** ================================
     *  렌더 루프
     * ================================ */
    function animate() {
        requestAnimationFrame(animate);
        if (renderer && scene && camera) renderer.render(scene, camera);
    }

    /** ================================
     *  장면 초기화 (기존 오브젝트 제거)
     * ================================ */
    function clearScene() {
        if (!scene) return;

        // 모든 child 제거
        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }

        rootGroup = new THREE.Group();
        scene.add(rootGroup);

        faceGroups = [];
        for (let i = 0; i < 6; i++) {
            faceGroups.push(new THREE.Group());
            rootGroup.add(faceGroups[i]);
        }
    }

    /** ================================
     *  주어진 net을 Three.js 면으로 생성해 평면 배치
     **  net = { faces:[{id,u,v},...], adjacency:[...] }
     ================================ */
    FoldEngine.loadNet = function (net) {
        clearScene();

        const faces = net.faces;
        if (faces.length !== 6) {
            console.warn("정육면체가 아니라 6면이 아닙니다!", faces);
            return;
        }

        // 면 생성 (1x1 Plane)
        const geom = new THREE.PlaneGeometry(1, 1);
        const materials = [
            new THREE.MeshBasicMaterial({ color: 0xff6666, side: THREE.DoubleSide }),
            new THREE.MeshBasicMaterial({ color: 0x66ff66, side: THREE.DoubleSide }),
            new THREE.MeshBasicMaterial({ color: 0x6666ff, side: THREE.DoubleSide }),
            new THREE.MeshBasicMaterial({ color: 0xffff66, side: THREE.DoubleSide }),
            new THREE.MeshBasicMaterial({ color: 0xff66ff, side: THREE.DoubleSide }),
            new THREE.MeshBasicMaterial({ color: 0x66ffff, side: THREE.DoubleSide }),
        ];

        for (let i = 0; i < 6; i++) {
            const mesh = new THREE.Mesh(geom, materials[i]);
            faceGroups[i].add(mesh);
        }

        // (u, v) 기준으로 평면 배치
        faces.forEach(f => {
            const grp = faceGroups[f.id];
            grp.position.set(f.u, -f.v, 0);   // Y축 방향 반전(-v)은 화면 감각상 편함
        });

        // parent-child 구조 만들기
        buildHingeTree(net);

        // 접힘 목표 각도 초기화
        prepareTargetRotations(net);
    };

    /** ================================
     *  parent-child 트리 구성
     *  (기준 face: id=0) → BFS로 나머지 연결
     ================================ */
    function buildHingeTree(net) {
        const faces = net.faces;
        const adjacency = net.adjacency;

        // 먼저 모든 faceGroups[i]를 rootGroup 하위로 초기화했음
        // parent-child를 재설정하기 위해 일단 detach
        for (let i = 0; i < faces.length; i++) {
            rootGroup.attach(faceGroups[i]);
        }

        // BFS
        const visited = new Set();
        const queue = [faces[0].id];
        visited.add(faces[0].id);

        while (queue.length > 0) {
            const current = queue.shift();

            // current를 기준으로 인접 face 연결
            adjacency
                .filter(a => a.from === current)
                .forEach(a => {
                    const next = a.to;
                    if (!visited.has(next)) {
                        // next 면을 current의 child로 만들기
                        faceGroups[current].add(faceGroups[next]);
                        visited.add(next);
                        queue.push(next);
                    }
                });
        }
    }

    /** ================================
     *  각 face의 회전축 & target rotation 설정
     *  (정육면체 접는 규칙)
     ================================ */
    function prepareTargetRotations(net) {
        // 초기화: 모든 항목 0
        for (let i = 0; i < net.faces.length; i++) {
            faceTargetRotation[i] = { x: 0, y: 0, z: 0 };
        }

        const adjacency = net.adjacency;

        adjacency.forEach(a => {
            const from = a.from;
            const to = a.to;

            // direction에 따라 회전축 결정
            // (접을 때 90° 회전)
            const rotation = faceTargetRotation[to];

            switch (a.dir) {
                case 'left':
                    rotation.y = Math.PI / 2;
                    break;

                case 'right':
                    rotation.y = -Math.PI / 2;
                    break;

                case 'up':
                    rotation.x = -Math.PI / 2;
                    break;

                case 'down':
                    rotation.x = Math.PI / 2;
                    break;
            }
        });
    }

    /** ================================
     *  즉시 펼쳐진 상태(전개도 상태)로 만들기
     ================================ */
    FoldEngine.unfoldImmediate = function () {
        for (let i = 0; i < faceGroups.length; i++) {
            faceGroups[i].rotation.set(0, 0, 0);
        }
    };

    /** ================================
     *  3D 접힘 애니메이션
     *  (requestAnimationFrame 기반)
     ================================ */
    FoldEngine.foldAnimate = function (duration = 1.2) {
        if (animating) return;
        animating = true;

        const start = {};
        for (let i = 0; i < faceGroups.length; i++) {
            start[i] = {
                x: faceGroups[i].rotation.x,
                y: faceGroups[i].rotation.y,
                z: faceGroups[i].rotation.z
            };
        }

        const end = faceTargetRotation;
        const total = duration;
        let t = 0;

        function step() {
            const dt = clock.getDelta();
            t += dt;

            const ratio = Math.min(t / total, 1);
            const ease = ratio * ratio * (3 - 2 * ratio); // smoothstep

            for (let i = 0; i < faceGroups.length; i++) {
                const s = start[i];
                const e = end[i];
                faceGroups[i].rotation.x = s.x + (e.x - s.x) * ease;
                faceGroups[i].rotation.y = s.y + (e.y - s.y) * ease;
                faceGroups[i].rotation.z = s.z + (e.z - s.z) * ease;
            }

            if (ratio < 1) {
                requestAnimationFrame(step);
            } else {
                animating = false;
            }
        }
        requestAnimationFrame(step);
    };

})();
