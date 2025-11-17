/**
 * overlap.js
 *
 * 겹치는 점/선 찾기 문제 전용 모듈.
 *
 * 기능:
 *   1) 전개도(canvas) 클릭 → face/vertex local index 계산
 *   2) 학생 선택(점 또는 선)을 기록
 *   3) validator.js의 checkOverlap()과 연동
 *
 * 외부로 제공되는 주요 함수:
 *
 *   Overlap.init(canvas, net)
 *   Overlap.onCanvasClick(e)
 *   Overlap.getSelections()
 *   Overlap.clear()
 *
 * 내부 구조:
 *   selections = { first: {faceId, localIndex}, second: {faceId, localIndex} }
 *
 */

(function () {
    'use strict';

    const Overlap = {};
    window.Overlap = Overlap;

    // --------------------------------------------
    // 내부 상태
    // --------------------------------------------
    let canvas = null;
    let ctx = null;
    let net = null; // cube_nets.js에서 만들어지는 전개도 구조
    let selections = {
        first: null,
        second: null,
    };

    // 전개도 face 크기
    // 이 값은 index.html의 canvas 크기와 정확히 일치해야 한다.
    const FACE_SIZE = 80;  // px 단위 (main.js에서 net을 그릴 때와 동일해야 함)

    // --------------------------------------------
    // 초기화
    // --------------------------------------------
    Overlap.init = function (canvasEl, netData) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        net = netData;
        selections.first = null;
        selections.second = null;
    };

    // --------------------------------------------
    // canvas 에서 클릭 좌표 → 전개도 faceId 찾기
    // --------------------------------------------
    function findFaceFromCanvas(x, y) {
        // net.faces = [{id, u, v}, ...]
        // u*FACE_SIZE <= x < (u+1)*FACE_SIZE
        // v*FACE_SIZE <= y < (v+1)*FACE_SIZE

        for (const f of net.faces) {
            const left = f.u * FACE_SIZE;
            const top = f.v * FACE_SIZE;
            const right = left + FACE_SIZE;
            const bottom = top + FACE_SIZE;

            if (x >= left && x < right && y >= top && y < bottom) {
                return f.id;
            }
        }
        return null;
    }

    // --------------------------------------------
    // face에서 local vertex index(0~3) 계산
    //
    //  (0,0) ─ (1,0)
    //    |       |
    //  (0,1) ─ (1,1)
    //
    // localIndex:
    //  0: 좌상
    //  1: 우상
    //  2: 우하
    //  3: 좌하
    // --------------------------------------------
    function findLocalVertexIndex(x, y, face) {
        const left = face.u * FACE_SIZE;
        const top = face.v * FACE_SIZE;

        const localX = x - left;
        const localY = y - top;

        // 바운더리 체크(조금 느슨한 허용)
        if (localX < 0 || localX > FACE_SIZE || localY < 0 || localY > FACE_SIZE) {
            return null;
        }

        // 좌상인지?
        if (localX < FACE_SIZE * 0.3 && localY < FACE_SIZE * 0.3) return 0;
        // 우상
        if (localX > FACE_SIZE * 0.7 && localY < FACE_SIZE * 0.3) return 1;
        // 우하
        if (localX > FACE_SIZE * 0.7 && localY > FACE_SIZE * 0.7) return 2;
        // 좌하
        if (localX < FACE_SIZE * 0.3 && localY > FACE_SIZE * 0.7) return 3;

        return null;
    }

    // --------------------------------------------
    // Canvas 클릭 처리
    // --------------------------------------------
    Overlap.onCanvasClick = function (evt) {
        if (!canvas || !net) return;

        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;

        // 1) 어느 face를 클릭했는가?
        const faceId = findFaceFromCanvas(x, y);
        if (faceId === null) return;

        const face = net.faces.find(f => f.id === faceId);

        // 2) face 안에서 어떤 vertex를 클릭했는가?
        const localIndex = findLocalVertexIndex(x, y, face);
        if (localIndex === null) return;

        const info = { faceId, localIndex };

        // 3) first → second 순서로 저장
        if (!selections.first) {
            selections.first = info;
        } else if (!selections.second) {
            selections.second = info;
        } else {
            // 이미 2개 선택했으면 초기화 후 다시 시작
            selections.first = info;
            selections.second = null;
        }

        drawSelectionMarkers();
    };

    // --------------------------------------------
    // 선택 표시 UI (canvas 위 점 표시)
    // --------------------------------------------
    function drawSelectionMarkers() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 원래 전개도를 다시 그림
        if (window.NetRenderer) {
            NetRenderer.drawNet(ctx, net);
        }

        // 선택 마커 표시
        drawMarker(selections.first, 'red');
        drawMarker(selections.second, 'blue');
    }

    function drawMarker(sel, color) {
        if (!sel) return;

        const face = net.faces.find(f => f.id === sel.faceId);
        if (!face) return;

        const left = face.u * FACE_SIZE;
        const top = face.v * FACE_SIZE;

        // vertex 위치
        let vx = left;
        let vy = top;

        if (sel.localIndex === 1) {
            vx = left + FACE_SIZE;
        } else if (sel.localIndex === 2) {
            vx = left + FACE_SIZE;
            vy = top + FACE_SIZE;
        } else if (sel.localIndex === 3) {
            vy = top + FACE_SIZE;
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(vx, vy, 6, 0, Math.PI * 2);
        ctx.fill();
    }

    // --------------------------------------------
    // 선택 내용 가져오기
    //  → main.js → validator.checkOverlap() 호출 시 사용
    // --------------------------------------------
    Overlap.getSelections = function () {
        return { ...selections };
    };

    // --------------------------------------------
    // 초기화
    // --------------------------------------------
    Overlap.clear = function () {
        selections.first = null;
        selections.second = null;
        drawSelectionMarkers();
    };

})();
