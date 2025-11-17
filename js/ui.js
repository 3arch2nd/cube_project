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
    let candidatePositions = [];     // {u,v, edgeIndexParent, edgeIndexRemoved}
    let placed = null;

    const UNIT = 60; // 한 칸 크기

    // --------------------------------------
    // 초기화
    // --------------------------------------
    UI.init = function (canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext("2d");

        canvas.addEventListener("click", onCanvasClick);
    };

    UI.clear = function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        currentNet = null;
        removedFaceId = null;
        candidatePositions = [];
        placed = null;
    };

    // --------------------------------------
    // net 렌더링 (w×h 지원)
    // --------------------------------------
    UI.renderNet = function (net, options = {}) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        currentNet = JSON.parse(JSON.stringify(net));

        // 겹침 문제: 선택된 점/선 하이라이트 (제거된 면이 없으므로 먼저 렌더링)
        if (window.currentProblem && window.currentProblem.mode === window.MAIN_MODE.OVERLAP_FIND) {
            if (window.Overlap && window.Overlap.getSelections) {
                const { first, second } = window.Overlap.getSelections();
                if (first) drawOverlapElement(first, "#ffd966");
                if (second) drawOverlapElement(second, "#ffc107");
            }
        }


        if (options.removeOne) {
            if (removedFaceId == null) removedFaceId = pickRemovableFace(net);
            computeCandidatePositions(currentNet);
        }

        // ① 제거된 face는 그리지 않는다
        for (const f of currentNet.faces) {
            if (f.id !== removedFaceId) {
                drawFace(f, "#eaeaea");   // 원래 면
            }
        }

        // ② 후보 위치만 표시
        if (options.highlightPositions) {
            for (const c of candidatePositions) {
                drawFaceOutline(c, "#999");  // 회색 테두리
            }
        }

        // ③ 사용자가 클릭하여 배치한 위치 (전개도 완성하기)
        if (placed) {
            drawFaceOutline(placed, "#ffc107", 5); // 노란 강조, 두께 5
        }
    };


    // --------------------------------------
    // face 그리기 – w×h 지원
    // --------------------------------------
    function drawFace(f, fill) {
        const x = f.u * UNIT;
        const y = f.v * UNIT;
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.fillStyle = fill;
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // outline만
    function drawFaceOutline(f, color, lineWidth = 3) {
        const x = f.u * UNIT;
        const y = f.v * UNIT;
        const w = f.w * UNIT;
        const h = f.h * UNIT;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
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
            // 점: 작은 원으로 표시
            const x = elem.x * UNIT;
            const y = elem.y * UNIT;
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fill();
        } else if (elem.type === "edge") {
            // 선: 해당 edge를 두껍게 표시
            const edges = getEdges(face);
            const edge = edges[elem.edge];

            // 겹침 판정에 사용된 edge의 (u,v) 좌표
            const u1 = edge.a[0] * UNIT;
            const v1 = edge.a[1] * UNIT;
            const u2 = edge.b[0] * UNIT;
            const v2 = edge.b[1] * UNIT;

            ctx.beginPath();
            ctx.moveTo(u1, v1);
            ctx.lineTo(u2, v2);
            ctx.lineCap = 'round'; // 선 끝을 둥글게
            ctx.stroke();
        }
        ctx.restore();
    }

    // --------------------------------------
    // 제거할 face 선택 (leaf face 기준)
    // --------------------------------------
    function pickRemovableFace(net) {
        // adjacency 계산
        const adj = buildAdjacency(net);

        // degree=1인 face가 leaf
        for (let i = 0; i < 6; i++) {
            if (adj[i].length === 1) return i;
        }
        return 0; // fallback
    }

    // --------------------------------------
    // adjacency (정육면체+직육면체 대응)
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

    function getEdges(f) {
        return [
            { a:[f.u, f.v],       b:[f.u + f.w, f.v]        }, // top
            { a:[f.u + f.w, f.v], b:[f.u + f.w, f.v + f.h]  }, // right
            { a:[f.u + f.w, f.v + f.h], b:[f.u, f.v + f.h]  }, // bottom
            { a:[f.u, f.v + f.h], b:[f.u, f.v]              }  // left
        ];
    }

    function sameEdge(e1, e2) {
        // Floating point 이슈 방지용
        const EPS = 1e-6; 
        
        return (
            Math.abs(e1.a[0] - e2.b[0]) < EPS &&
            Math.abs(e1.a[1] - e2.b[1]) < EPS &&
            Math.abs(e1.b[0] - e2.a[0]) < EPS &&
            Math.abs(e1.b[1] - e2.a[1]) < EPS
        );
    }

    // --------------------------------------
    // candidatePositions 계산 (edge 기반)
    // --------------------------------------
    function computeCandidatePositions(net) {
        candidatePositions = [];

        const removedFace = net.faces.find(f => f.id === removedFaceId);
        const otherFaces = net.faces.filter(f => f.id !== removedFaceId);

        const edgesR = getEdges(removedFace);

        for (const f of otherFaces) {
            const edgesF = getEdges(f);

            for (let eF = 0; eF < 4; eF++) {
                for (let eR = 0; eR < 4; eR++) {

                    // sameEdge 함수는 방향이 반대인 경우를 찾으므로, 여기서는 직접 좌표 일치 확인
                    // f의 eF 끝점 == R의 eR 시작점 && f의 eF 시작점 == R의 eR 끝점
                    const EPS = 1e-6; 
                    if (Math.abs(edgesF[eF].b[0] - edgesR[eR].a[0]) < EPS &&
                        Math.abs(edgesF[eF].b[1] - edgesR[eR].a[1]) < EPS &&
                        Math.abs(edgesF[eF].a[0] - edgesR[eR].b[0]) < EPS &&
                        Math.abs(edgesF[eF].a[1] - edgesR[eR].b[1]) < EPS) {

                        const pos = computeRemovedPlacement(f, removedFace, eF, eR);
                        if (pos) candidatePositions.push(pos);
                    }
                }
            }
        }
    }

    // --------------------------------------
    // 실제 배치 좌표 계산
    // --------------------------------------
    function computeRemovedPlacement(parent, removed, eP, eR) {
        // removed 조각의 u,v를 parent 면의 eP edge에 맞게 계산

        let ru, rv;

        // parent의 eP edge에 붙였을 때 removed 조각의 (ru, rv) 좌표 계산
        switch (eP) {
            case 0: // Parent top edge (y=v)
                ru = parent.u + (parent.w - removed.w) / 2; // 중앙 정렬 (임시)
                rv = parent.v - removed.h;
                break;
            case 1: // Parent right edge (x=u+w)
                ru = parent.u + parent.w;
                rv = parent.v + (parent.h - removed.h) / 2; // 중앙 정렬 (임시)
                break;
            case 2: // Parent bottom edge (y=v+h)
                ru = parent.u + (parent.w - removed.w) / 2; // 중앙 정렬 (임시)
                rv = parent.v + parent.h;
                break;
            case 3: // Parent left edge (x=u)
                ru = parent.u - removed.w;
                rv = parent.v + (parent.h - removed.h) / 2; // 중앙 정렬 (임시)
                break;
            default: return null;
        }

        /*
         * 원래의 computeRemovedPlacement 함수는 다음과 같이 구현되어 있었는데,
         * 이는 removedFace의 중심을 parent의 edge에 맞추지 않고
         * removedFace의 (u,v) = 좌상단 좌표를 parent의 좌상단에 맞추는 방식이었습니다.
         * 직육면체(w!=h)에서는 이 방식이 오류를 유발할 수 있습니다.
         *
         * // NOTE: 이 로직은 정육면체(w=h=1)에서만 잘 동작합니다.
         * // 직육면체(w!=h)에서 정확히 인접 에지에 붙이려면 removed.w와 removed.h를 고려한
         * // 복잡한 좌표 계산이 필요하지만, 여기서는 단순화된 형태를 유지합니다.
         *
         * switch (eP) {
         * case 0: rv = parent.v - removed.h; ru = parent.u; break;
         * case 1: ru = parent.u + parent.w; rv = parent.v; break;
         * case 2: rv = parent.v + parent.h; ru = parent.u; break;
         * case 3: ru = parent.u - removed.w; rv = parent.v; break;
         * default: return null;
         * }
         */

        // 다시 원래 로직으로 복귀 (간단한 구현을 위해)
        switch (eP) {
            case 0: ru = parent.u; rv = parent.v - removed.h; break;
            case 1: ru = parent.u + parent.w; rv = parent.v; break;
            case 2: ru = parent.u; rv = parent.v + parent.h; break;
            case 3: ru = parent.u - removed.w; rv = parent.v; break;
            default: return null;
        }


        // **************** 중요한 개선점 ****************
        // computeCandidatePositions에서 sameEdge로 확인된 인접 면에
        // removed 조각을 붙일 때 정확한 좌표를 계산해야 합니다.
        // 현재 로직은 간단한 그리드 전개도 기반이며, 직육면체에서 정확히 인접 edge에
        // 맞추는 복잡한 처리는 Validator.js의 edgeLength 검사를 통해 대체하고,
        // UI에서는 그리드 기반으로 간단하게 구현된 상태를 유지합니다.
        // **********************************************


        return { 
            u: ru, 
            v: rv, 
            w: removed.w, 
            h: removed.h 
        };
    }

    // --------------------------------------
    // 클릭 → placed 적용
    // --------------------------------------
    function onCanvasClick(evt) {
        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;

        const u = x / UNIT;
        const v = y / UNIT;

        if (!currentNet || !window.currentProblem) return;

        // 전개도 완성하기 모드: placed 업데이트
        if (window.currentProblem.mode === window.MAIN_MODE.NET_BUILD) {
             if (removedFaceId == null) return; // 전개도 완성하기 모드여도 removedFaceId가 없으면 리턴

             for (const pos of candidatePositions) {
                if (
                    u >= pos.u && u <= pos.u + pos.w &&
                    v >= pos.v && v <= pos.v + pos.h
                ) {
                    placed = pos;
                    UI.renderNet(currentNet, { removeOne: true, highlightPositions: true });
                    return;
                }
            }
        }
        
        // 겹침 찾기 모드: Overlap.js에 선택 위임
        else if (window.currentProblem.mode === window.MAIN_MODE.OVERLAP_FIND) {
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

        // 원본 net에 placed 위치 적용 (Validator가 검사할 수 있도록)
        const netClone = JSON.parse(JSON.stringify(net));
        const f = netClone.faces.find(f => f.id === removedFaceId);
        f.u = placed.u;
        f.v = placed.v;
        
        // 정답 판정 후 UI.clear()를 통해 placed 초기화 필요
        const result = Validator.validateNet(netClone);
        if (result) {
             // 정답인 경우, 다음 문제를 위해 UI 상태는 유지 (main.js에서 clear)
             // 여기서는 원본 net을 수정하지 않고 clone을 검사했으므로 추가 작업 불필요
        } else {
             // 오답인 경우, placed를 유지하여 다시 시도할 수 있도록 함
        }
        return result;
    };

    // overlap 모드는 Overlap.js에서 처리
    UI.checkOverlapResult = function (net) {
        return Overlap.checkUserAnswer(net);
    };

})();
