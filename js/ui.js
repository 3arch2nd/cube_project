/**
 * ui.js
 *
 * 모든 UI 렌더링 및 사용자 인터랙션 담당.
 * (문제 유형: 전개도 / 조각 배치 / 겹치는 점·선)
 *
 * 외부에서 main.js가 호출하는 주요 API:
 *
 *   UI.init(canvasElement)
 *   UI.renderNet(net, options)
 *   UI.enablePiecePlacement(net)
 *   UI.getPlacedPiece()
 *   UI.clear()
 *
 * 겹침 문제 관련:
 *   UI.enableOverlapMode(net)
 *   UI.getOverlapSelections()   // Overlap.js API 래핑
 */

(function () {
    'use strict';

    const UI = {};
    window.UI = UI;

    // ---------------------------
    // 상태
    // ---------------------------
    let canvas = null;
    let ctx = null;
    let currentNet = null;

    const FACE_SIZE = 80; // px — overlap.js와 동일해야 함!
    const COLORS = {
        face: "#e0e0e0",
        border: "#333",
        empty: "#ffffff",
        highlight: "#ffd966",
        pieceCandidate: "#b6d7a8"
    };

    // 조각 배치 상태
    let removedFaceId = null;   // 떼어낸 조각 faceId
    let candidatePositions = []; // 학생이 놓을 수 있는 후보 u,v
    let placed = null;          // {u, v} 형태

    // Overlap 모드 사용 여부
    let overlapMode = false;

    // ---------------------------
    // 초기화
    // ---------------------------
    UI.init = function (canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext("2d");
        canvas.addEventListener("click", onCanvasClick);
    };

    UI.clear = function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        currentNet = null;
        removedFaceId = null;
        candidatePositions = [];
        placed = null;
        overlapMode = false;
    };

    // ---------------------------
    // 전개도 그리기 (메인 기능)
    // ---------------------------
    UI.renderNet = function (net, options = {}) {
        /**
         * options:
         *   removeOne: true/false  → 면 하나를 떼는 문제 유형
         *   highlightPositions: candidatePositions 배열을 색칠할지 여부
         */

        currentNet = JSON.parse(JSON.stringify(net));

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 조각 제거가 요청되면 face 하나 골라 정해둠
        if (options.removeOne) {
            if (removedFaceId === null) {
                removedFaceId = pickLeafFace(currentNet);
                computeCandidatePositions(currentNet, removedFaceId);
            }
        }

        // 전개도 6칸 그리기
        currentNet.faces.forEach(face => {
            const { u, v, id } = face;

            // 제거된 조각이면 빈칸 처리
            if (id === removedFaceId) {
                drawFaceRect(u, v, COLORS.empty, true);
                return;
            }

            drawFaceRect(u, v, COLORS.face, false);
        });

        // 후보 위치 표시
        if (options.highlightPositions && candidatePositions.length > 0) {
            candidatePositions.forEach(pos => {
                drawFaceRect(pos.u, pos.v, COLORS.pieceCandidate, false);
            });
        }

        // 학생이 실제로 조각을 놓았다면 표시
        if (placed) {
            drawFaceRect(placed.u, placed.v, COLORS.highlight, false);
        }
    };

    // ---------------------------
    // 하나의 face 사각형 그리기
    // ---------------------------
    function drawFaceRect(u, v, color, dashed = false) {
        const x = u * FACE_SIZE;
        const y = v * FACE_SIZE;

        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = COLORS.border;
        ctx.lineWidth = 2;

        if (dashed) {
            ctx.setLineDash([6, 4]);
        } else {
            ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.rect(x, y, FACE_SIZE, FACE_SIZE);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // ============================================================
    // 1) 떼어낼 face(id) 자동 선택: "leaf face" 우선
    // ============================================================
    function pickLeafFace(net) {
        const adj = CubeNets.getNetById(net.id).adjacency;

        // adjacency로 연결된 face 개수를 카운트
        let best = 0;
        let bestDegree = 999;

        const deg = {};
        adj.forEach(a => {
            deg[a.from] = (deg[a.from] || 0) + 1;
        });

        // leaf(face 연결 1) 중 아무거나 선택
        for (const k in deg) {
            if (deg[k] === 1) {
                return parseInt(k);
            }
        }
        // leaf가 없다? 그럼 faceId 0 제거
        return 0;
    }

    // ============================================================
    // 2) 학생이 조각을 놓을 수 있는 후보 위치 계산
    // ============================================================
    function computeCandidatePositions(net, removedFaceId) {
        const placedFaces = net.faces.filter(f => f.id !== removedFaceId);

        const usedMap = {};
        placedFaces.forEach(f => {
            usedMap[f.u + "," + f.v] = true;
        });

        const dirs = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
        ];

        const candidates = [];

        placedFaces.forEach(f => {
            dirs.forEach(([du, dv]) => {
                const nu = f.u + du;
                const nv = f.v + dv;
                const key = nu + "," + nv;

                // 기존 face가 없고, 네트 전체 범위를 너무 벗어나지 않으면 후보
                if (!usedMap[key] && nu >= -1 && nv >= -1 && nu <= 6 && nv <= 6) {
                    candidates.push({ u: nu, v: nv });
                }
            });
        });

        // 중복 제거
        const uniq = {};
        candidatePositions = [];
        candidates.forEach(c => {
            const key = c.u + "," + c.v;
            if (!uniq[key]) {
                uniq[key] = true;
                candidatePositions.push(c);
            }
        });
    }

    // ---------------------------
    // Canvas 클릭 처리 (전개도 모드)
    // ---------------------------
    function onCanvasClick(evt) {
        if (!currentNet) return;

        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;

        const u = Math.floor(x / FACE_SIZE);
        const v = Math.floor(y / FACE_SIZE);

        if (overlapMode) {
            // 겹침 문제 모드는 Overlap.js로 전달
            Overlap.onCanvasClick(evt);
            return;
        }

        // 조각 배치 모드가 아닐 경우 무시
        if (removedFaceId === null) return;

        const clicked = { u, v };
        const clickedKey = u + "," + v;

        // 후보 위치 클릭했을 때만 배치 가능
        for (const pos of candidatePositions) {
            if (pos.u === u && pos.v === v) {
                placed = { u, v };
                UI.renderNet(currentNet, { removeOne: true, highlightPositions: true });
                return;
            }
        }
    }

    // ---------------------------
    // 학생이 놓은 조각 반환
    // ---------------------------
    UI.getPlacedPiece = function () {
        return placed; // {u, v}
    };

    // ---------------------------
    // 겹침(point/line) 문제 모드 활성화
    // ---------------------------
    UI.enableOverlapMode = function (net) {
        overlapMode = true;
        Overlap.init(canvas, net);
    };

    UI.getOverlapSelections = function () {
        return Overlap.getSelections();
    };

})();

// ========== ui.js Part 2 시작 ==========

    // ---------------------------------------------------------
    // 3D 간단 접힘 미리보기 / 결과 확인용 함수
    // ---------------------------------------------------------
    UI.showFoldedCube = function (net, callback) {
        /**
         * 1) Three.js 영역을 가져온다
         * 2) FoldEngine.init(canvasThree)
         * 3) FoldEngine.loadNet(net)
         * 4) FoldEngine.unfoldImmediate()
         * 5) FoldEngine.foldAnimate()
         * 6) 애니메이션이 끝난 후 callback()
         */

        const threeCanvas = document.getElementById("three-view");
        if (!threeCanvas) {
            console.error("three-view 캔버스를 찾을 수 없습니다.");
            return;
        }

        // Three.js 초기화
        if (!FoldEngine._initialized) {
            FoldEngine.init(threeCanvas);
            FoldEngine._initialized = true;
        }

        // 3D 장면에 전개도 로딩
        FoldEngine.loadNet(net);
        FoldEngine.unfoldImmediate();

        // 약간 딜레이 후 접기 애니메이션 수행
        setTimeout(() => {
            FoldEngine.foldAnimate(1.2);

            // 애니메이션 후 콜백
            setTimeout(() => {
                if (callback) callback();
            }, 1500);

        }, 200);
    };

    // ---------------------------------------------------------
    // 조각 배치 문제 정답 판정
    // ---------------------------------------------------------
    UI.checkPieceResult = function (net) {
        /**
         * placed = {u, v}
         * → removedFaceId를 replaced 위치에 다시 넣어 net.faces를 재구성
         * → Validator.isValidCubeNet()으로 전개도 자체가 정육면체 전개도인지 판정
         */

        if (!placed) return false;

        // 새 net 재구성
        const newNet = JSON.parse(JSON.stringify(net));

        const removed = removedFaceId;

        // removedFaceId 가진 face 찾기
        const face = newNet.faces.find(f => f.id === removed);
        if (!face) return false;

        face.u = placed.u;
        face.v = placed.v;

        // 정답 판정 (11종 중 하나인지)
        return Validator.isValidCubeNet(newNet);
    };

    // ---------------------------------------------------------
    // 겹침 문제 정답 판정
    // ---------------------------------------------------------
    UI.checkOverlapResult = function (net) {
        /**
         * 1) Overlap.getSelections() → first & second
         * 2) FoldEngine에서 최종 접힌 cube의 geometry 추출
         * 3) validator.checkOverlap() 호출
         */

        const selections = Overlap.getSelections();
        if (!selections.first || !selections.second) return false;

        // 이미 접힌 cube geometry 가져오기
        const faceGroups = FoldEngine.getFaceGroups();
        const geom = Validator.extractCubeGeometry(faceGroups);

        return Validator.checkOverlap(geom, selections.first, selections.second);
    };

    // ---------------------------------------------------------
    // NetRenderer 모듈 (overlap.js에서도 사용)
    // ---------------------------------------------------------
    window.NetRenderer = {
        drawNet(ctx, net) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

            net.faces.forEach(face => {
                drawRect(face.u, face.v);
            });

            function drawRect(u, v) {
                const x = u * FACE_SIZE;
                const y = v * FACE_SIZE;

                ctx.save();
                ctx.fillStyle = "#e0e0e0";
                ctx.strokeStyle = "#333";
                ctx.lineWidth = 2;

                ctx.beginPath();
                ctx.rect(x, y, FACE_SIZE, FACE_SIZE);
                ctx.fill();
                ctx.stroke();

                ctx.restore();
            }
        }
    };

})();

