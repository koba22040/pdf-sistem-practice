export function parseDateTime(dateTimeString) {
    const d = new Date(dateTimeString); if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hour24 = d.getHours();
    const minute = d.getMinutes();
    
    // 和暦の簡易計算
    let yearWareki;
    if (year >= 2019) yearWareki = year - 2018; // 令和
    else if (year >= 1989) yearWareki = year - 1988; // 平成
    else if (year >= 1926) yearWareki = year - 1925; // 昭和
    else yearWareki = year;

    // 午前/午後
    const hourAM = (hour24 < 12) ? ((hour24 === 0) ? 12 : hour24).toString() : '';
    const hourPM = (hour24 >= 12) ? ((hour24 === 12) ? 12 : hour24 - 12).toString() : '';
  
    const minuteStr = String(minute).padStart(2, '0');
    const isPM = hour24 >= 12;
    // 午前の分 (午後は空文字)
    const minuteAM = !isPM ? minuteStr : '';
    // 午後の分 (午前は空文字)
    const minutePM = isPM ? minuteStr : '';
    return {
        'year-ad': String(year),
        'year-wareki': String(yearWareki),
        'month': String(month),
        'day': String(day),
        'hour-24': String(hour24),
        'hour-am': String(hourAM),
        'hour-pm': String(hourPM),
        'minute': minuteStr,    
        'minute-am': minuteAM,     
        'minute-pm': minutePM
    };
}
