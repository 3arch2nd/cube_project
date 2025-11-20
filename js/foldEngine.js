/************************************************************
 * 평면 배치용 중심 계산
 ************************************************************/
function computeNetCenter() {
    let minU = 999, maxU = -999;
    let minV = 999, maxV = -999;

    facesSorted.forEach(f => {
        minU = Math.min(minU, f.u);
        maxU = Math.max(maxU, f.u + f.w);
        minV = Math.min(minV, f.v);
        maxV = Math.max(maxV, f.v + f.h);
    });

    netCenter.x = (minU + maxU) / 2;
    netCenter.y = (minV + maxV) / 2;
}

/************************************************************
 * layoutFlat — 2D 전개도 좌표를 Babylon 3D로 매핑
 ************************************************************/
function layoutFlat() {
    const S = options.cellSize;

    facesSorted.forEach(f => {
        const node = nodes[f.id];

        // 면의 중심을 기준으로 3D 배치
        const cx = f.u + f.w / 2;
        const cy = f.v + f.h / 2;

        const x = (cx - netCenter.x) * S;
        const y = (netCenter.y - cy) * S;

        node.position = new BABYLON.Vector3(x, y, 0);
        node.rotationQuaternion = BABYLON.Quaternion.Identity();
    });

    // 카메라도 중앙을 바라보게
    if (camera) {
        camera.target = new BABYLON.Vector3(0, 0, 0);
    }
}
