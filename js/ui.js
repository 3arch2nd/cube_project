/**
 * ui.js – Cube + Rectangular Prism 전개도 완전 지원 버전
 */

(function () {
    "use strict";

    const UI = {};
    window.UI = UI;

    // 상태
    let canvas = null;
    let ctx = null;

    let currentNet = null;
    let removedFaceId = null;
    let candidatePositions = [];     // {u,v, w, h} - 유효한 배치 위치
    let placed = null;

    const UNIT = 60; // 한 칸 크기
    const EPS = 1e-6;
    
    // ⭐ 중앙 정렬을 위한 Offset
    let U_OFFSET = 0;
    let V_OFFSET = 0;


    // --------------------------------------
    // 초기화
    // --------------------------------------
    UI.init = function (canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext("2d");
        
        canvas.removeEventListener("click", onCanvasClick); 
        canvas.addEventListener("click", onCanvasClick);
    };

    UI.clear = function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        currentNet = null;
        removedFaceId = null;
        candidatePositions = [];
        placed = null;
        U_OFFSET = 0; // Offset 초기화
        V_OFFSET = 0;
    };

    // --------------------------------------
    // net 렌더링 (w×h 지원)
    // --------------------------------------
    UI.renderNet = function (net, options = {}) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        currentNet = JSON.parse(JSON.stringify(net));
        
        const isNetBuildMode = window.CubeProject && window.CubeProject.currentProblem && 
                               window.CubeProject.currentProblem.mode === window.CubeProject.MAIN_MODE.NET_BUILD;

        if (isNetBuildMode) {
             if (removedFaceId == null) removedFaceId = pickRemovableFace(net);
             computeCandidatePositions(currentNet); 
        }
        
        // ⭐ 1. 오류 수정: 중앙 정렬 Offset 계산 및 적용
        calculateCenterOffset(currentNet, removedFaceId, placed, isNetBuildMode);
        drawGrid(); // 2, 3. 오류 수정: 연한 색 모눈 전체 그리기


        // 겹침 문제: 선택된 점/선 하이라이트
        if (!isNetBuildMode) {
            if (window.Overlap && window.Overlap.getSelections) {
                const { first, second } = window.Overlap.getSelections();
                if (first) drawOverlapElement(first, "#ffd966");
                if (second) drawOverlapElement(second, "#ffc107");
            }
        }


        // ① 제거된 face는 그리지 않는다
        for (const f of currentNet.faces) {
            if (f.id !== removedFaceId) {
                // ⭐ 1. 문제 원본 부분은 진한 테두리
                drawFace(f, "#eaeaea", "#666");   // 원래 면
            }
        }

        // ② 후보 위치만 표시
        if (isNetBuildMode && options.highlightPositions) {
            for (const c of candidatePositions) {
                if (!isPositionOccupied(c)) {
                    drawFaceOutline(c, "#999", 3, "#f9f9f9"); // 연한 배경 추가
                }
            }
        }

        // ③ 사용자가 클릭하여 배치한 위치 (전개도 완성하기)
        if (placed) {
            drawFaceOutline(placed, "#ffc107", 5); 
        }
        
        // 캔버스 테두리 다시 그리기
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    };


    // --------------------------------------
    // 1. 모눈 중앙 정렬 계산 헬퍼
    // --------------------------------------
    function calculateCenterOffset(net, removedId, placedPos, isNetBuildMode) {
        if (!net || !net.faces.length) return;

        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;
        
        const facesToConsider = net.faces.filter(f => f.id !== removedId);
        
        // 활성 면들의 경계를 찾습니다.
        for (const f of facesToConsider) {
            minU = Math.min(minU, f.u);
            maxU = Math.max(maxU, f.u + f.w);
            minV = Math.min(minV, f.v);
            maxV = Math.max(maxV, f.v + f.h);
        }
        
        // 후보 위치까지 고려 (전체 레이아웃 크기)
        if (isNetBuildMode && candidatePositions.length > 0) {
            for (const c of candidatePositions) {
                minU = Math.min(minU, c.u);
                maxU = Math.max(maxU, c.u + c.w);
                minV = Math.min(minV, c.v);
                maxV = Math.max(maxV, c.v + c.h);
            }
        }

        // 배치된 조각이 있다면 포함
        if (placedPos) {
             minU = Math.min(minU, placedPos.u);
             maxU = Math.max(maxU, placedPos.u + placedPos.w);
             minV = Math.min(minV, placedPos.v);
             maxV = Math.max(maxV, placedPos.v + placedPos.h);
        }

        // 전개도의 크기 (단위: 칸)
        const netWidth = maxU - minU;
        const netHeight = maxV - minV;
        
        // 캔버스 크기 (단위: 픽셀)
        const canvasSize = canvas.width;
        
        // 전개도를 중앙에 배치하기 위한 Offset (단위: 칸)
        // (캔버스 픽셀 크기 / UNIT - 전개도 칸 크기) / 2 - 최소 U 좌표
        U_OFFSET = (canvasSize / UNIT - netWidth) / 2 - minU;
        V_OFFSET = (canvasSize / UNIT - netHeight) / 2 - minV;
        
        // 정수 칸 단위로 반올림 (모눈선 정렬)
        U_OFFSET = Math.round(U_OFFSET);
        V_OFFSET = Math.round(V_OFFSET);
    }
    
    // --------------------------------------
    // 2, 3. 오류 수정: 연한 모눈 전체 그리기
    // --------------------------------------
    function drawGrid() {
        const maxCells = Math.floor(canvas.width / UNIT) + 1; 
        
        ctx.save();
        ctx.strokeStyle = "#ddd"; // 연한 모눈 선
        ctx.lineWidth = 1;
        
        for (let i = 0; i < maxCells; i++) {
            // 수직선
            ctx.beginPath();
            ctx.moveTo(i * UNIT, 0);
            ctx.lineTo(i * UNIT, canvas.height);
            ctx.stroke();

            // 수평선
            ctx.beginPath();
            ctx.moveTo(0, i * UNIT);
            ctx.lineTo(canvas.width, i * UNIT);
            ctx.stroke();
        }

        ctx.restore();
    }


    // --------------------------------------
    // face 그리기 – w×h 지원
    // --------------------------------------
    function drawFace(f, fill, stroke = "#333") {
        // ⭐ Offset 적용
        const x = (f.u + U_OFFSET) * UNIT; 
        const y = (f.v + V_OFFSET) * UNIT; 
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke; // ⭐ 테두리 색상 적용
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // outline만
    function drawFaceOutline(f, color, lineWidth = 3, fillColor = 'transparent') {
        // ⭐ Offset 적용
        const x = (f.u + U_OFFSET) * UNIT; 
        const y = (f.v + V_OFFSET) * UNIT; 
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.fillStyle = fillColor; 
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    
    // --------------------------------------
    // 겹침 문제: 선택된 점/선 그리기
    // --------------------------------------
    function drawOverlapElement(elem, color) {
        if (!elem || !currentNet) return;
        
        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;

        const face = currentNet.faces.find(f => f.id === elem.face);
        if (!face) return;

        if (elem.type === "vertex") {
            // 점: 작은 원으로 표시 (⭐ Offset 적용)
            const x = (elem.x + U_OFFSET) * UNIT; 
            const y = (elem.y + V_OFFSET) * UNIT;
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fill();
        } else if (elem.type === "edge") {
            // 선: 해당 edge를 두껍게 표시
            const edges = getEdges(face);
            const edge = edges[elem.edge];

            // 겹침 판정에 사용된 edge의 (u,v) 좌표 (⭐ Offset 적용)
            const u1 = (edge.a[0] + U_OFFSET) * UNIT;
            const v1 = (edge.a[1] + V_OFFSET) * UNIT;
            const u2 = (edge.b[0] + U_OFFSET) * UNIT;
            const v2 = (edge.b[1] + V_OFFSET) * UNIT;

            ctx.beginPath();
            ctx.moveTo(u1, v1);
            ctx.lineTo(u2, v2);
            ctx.lineCap = 'round'; 
            ctx.stroke();
        }
        ctx.restore();
    }


    // --------------------------------------
    // [포함된 헬퍼 함수] 제거할 face 선택 (leaf face 기준)
    // --------------------------------------
    function pickRemovableFace(net) {
        const adj = buildAdjacency(net);

        for (let i = 0; i < 6; i++) {
            if (adj[i].length === 1) return i;
        }
        return 0; 
    }

    // --------------------------------------
    // [포함된 헬퍼 함수] adjacency (정육면체+직육면체 대응)
    // --------------------------------------
    function buildAdjacency(net) {
        const adj = [...Array(6)].map(() => []);
        for (let i = 0; i < net.faces.length; i++) {
            for (let j = i + 1; j < net.faces.length; j++) {
                const fi = net.faces[i];
                const fj = net.faces[j];

                const ei = getEdges(fi);
                const ej = getEdges(fj);

                for (let a = 0; a < 4; a++) {
                    for (let b = 0; b < 4; b++) {
                        if (sameEdge(ei[a], ej[b])) {
                            adj[fi.id].push({ to: fj.id, eA: a, eB: b });
                            adj[fj.id].push({ to: fi.id, eA: b, eB: a });
                        }
                    }
                }
            }
        }
        return adj;
    }

    // --------------------------------------
    // [포함된 헬퍼 함수] getEdges
    // --------------------------------------
    function getEdges(f) {
        return [
            { a:[f.u, f.v],       b:[f.u + f.w, f.v]        }, // top
            { a:[f.u + f.w, f.v], b:[f.u + f.w, f.v + f.h]  }, // right
            { a:[f.u + f.w, f.v + f.h], b:[f.u, f.v + f.h]  }, // bottom
            { a:[f.u, f.v + f.h], b:[f.u, f.v]              }  // left
        ];
    }

    // --------------------------------------
    // [포함된 헬퍼 함수] sameEdge
    // --------------------------------------
    function sameEdge(e1, e2) {
        return (
            Math.abs(e1.a[0] - e2.b[0]) < EPS &&
            Math.abs(e1.a[1] - e2.b[1]) < EPS &&
            Math.abs(e1.b[0] - e2.a[0]) < EPS &&
            Math.abs(e1.b[1] - e2.a[1]) < EPS
        );
    }
    
    // --------------------------------------
    // [포함된 헬퍼 함수] edgeLength
    // --------------------------------------
    function edgeLength(edge) {
        const [x1, y1] = edge.a;
        const [x2, y2] = edge.b;
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx*dx + dy*dy);
    }

    // --------------------------------------
    // candidatePositions 계산 (모든 유효한 빈 공간)
    // --------------------------------------
    function computeCandidatePositions(net) {
        candidatePositions = [];

        const removedFace = net.faces.find(f => f.id === removedFaceId);
        if (!removedFace) return; 

        const activeFaces = net.faces.filter(f => f.id !== removedFaceId);

        for (const parent of activeFaces) {
            const edgesF = getEdges(parent);

            for (let eP = 0; eP < 4; eP++) { 
                for (let eR = 0; eR < 4; eR++) { 

                    const p_edge_len = edgeLength(edgesF[eP]);
                    const r_edge_len = edgeLength(getEdges(removedFace)[eR]);
                    
                    if (Math.abs(p_edge_len - r_edge_len) > EPS) {
                        continue; 
                    }

                    const pos = computePlacementByAttachment(parent, removedFace, eP, eR);
                    
                    if (pos) {
                        const isDuplicate = candidatePositions.some(c => 
                            Math.abs(c.u - pos.u) < EPS && Math.abs(c.v - pos.v) < EPS);
                        
                        if (!isDuplicate) {
                            candidatePositions.push(pos);
                        }
                    }
                }
            }
        }
    }
    
    // --------------------------------------
    // 실제 배치 좌표 계산 (인접 Edge 기준으로)
    // --------------------------------------
    function computePlacementByAttachment(parent, removed, eP, eR) {
        let ru, rv;

        switch (eP) {
            case 0: ru = parent.u; rv = parent.v - removed.h; break;
            case 1: ru = parent.u + parent.w; rv = parent.v; break;
            case 2: ru = parent.u; rv = parent.v + parent.h; break;
            case 3: ru = parent.u - removed.w; rv = parent.v; break;
            default: return null;
        }

        return { 
            u: ru, 
            v: rv, 
            w: removed.w, 
            h: removed.h 
        };
    }

    // --------------------------------------
    // [포함된 헬퍼 함수] isPositionOccupied
    // --------------------------------------
    function isPositionOccupied(pos) {
         for (const f of currentNet.faces) {
             if (f.id !== removedFaceId && 
                 Math.abs(f.u - pos.u) < EPS && Math.abs(f.v - pos.v) < EPS &&
                 Math.abs(f.w - pos.w) < EPS && Math.abs(f.h - pos.h) < EPS) {
                 return true;
             }
         }
         return false;
    }

    // --------------------------------------
    // 클릭 → placed 적용
    // --------------------------------------
    function onCanvasClick(evt) {
        const rect = canvas.getBoundingClientRect();
        // ⭐ Offset 반영된 픽셀 위치 계산
        const x = (evt.clientX - rect.left);
        const y = (evt.clientY - rect.top);

        // ⭐ 캔버스 픽셀 위치를 Offset이 적용된 그리드 좌표로 변환
        const u = x / UNIT - U_OFFSET;
        const v = y / UNIT - V_OFFSET;

        if (!currentNet || !window.CubeProject || !window.CubeProject.currentProblem) return;

        // 전개도 완성하기 모드: placed 업데이트
        if (window.CubeProject.currentProblem.mode === window.CubeProject.MAIN_MODE.NET_BUILD) {
             if (removedFaceId == null) return; 

             for (const pos of candidatePositions) {
                if (u >= pos.u && u < pos.u + pos.w && v >= pos.v && v < pos.v + pos.h) {
                    
                    if (isPositionOccupied(pos)) return; 
                    
                    placed = pos;
                    UI.renderNet(currentNet, { removeOne: true, highlightPositions: true });
                    return;
                }
            }
        }
        
        // 겹침 찾기 모드: Overlap.js에 선택 위임
        else if (window.CubeProject.currentProblem.mode === window.CubeProject.MAIN_MODE.OVERLAP_FIND) {
            const result = window.Overlap.recordClick(u, v);
            if (result) {
                UI.renderNet(currentNet, {}); // 선택 하이라이트 위해 재렌더링
                return;
            }
        }
    }

    // --------------------------------------
    // 정답 판정 (validator 연결)
    // --------------------------------------
    UI.checkPieceResult = function (net) {
        if (!placed) return false;

        const netClone = JSON.parse(JSON.stringify(net));
        const f = netClone.faces.find(f => f.id === removedFaceId);
        
        // placed 위치를 복제본에 적용
        f.u = placed.u;
        f.v = placed.v;
        
        // 4. 오류 수정: 정답 확인 시 FoldEngine이 현재 placed 상태로 로드되어 접히도록 처리
        window.FoldEngine.loadNet(netClone);

        const result = Validator.validateNet(netClone);
        
        return result;
    };

    // overlap 모드는 Overlap.js에서 처리
    UI.checkOverlapResult = function (net) {
        return window.Overlap.checkUserAnswer(net);
    };

})();
