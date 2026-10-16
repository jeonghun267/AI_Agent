// Plain-text bodies of the account emails. Pure: values in, {to, subject, text} out.

export function verifyEmailMessage({to, name, link, hours}) {
  return {
    to,
    subject: '[ReLo] 이메일 주소를 인증해 주세요',
    text: [
      `${name}님, ReLo에 가입해 주셔서 고마워요.`,
      '',
      '아래 링크를 열면 이메일 인증이 끝나요.',
      link,
      '',
      `이 링크는 ${hours}시간 동안 한 번만 쓸 수 있어요.`,
      '직접 가입하지 않았다면 이 메일은 무시해도 돼요.',
    ].join('\n'),
  };
}

export function resetPasswordMessage({to, name, link, minutes}) {
  return {
    to,
    subject: '[ReLo] 비밀번호 재설정 링크',
    text: [
      `${name}님, 비밀번호 재설정을 요청하셨어요.`,
      '',
      '아래 링크를 열어 새 비밀번호를 정하세요.',
      link,
      '',
      `이 링크는 ${minutes}분 동안 한 번만 쓸 수 있어요. 비밀번호를 바꾸면 모든 기기에서 로그아웃돼요.`,
      '직접 요청하지 않았다면 이 메일은 무시하세요. 비밀번호는 바뀌지 않아요.',
    ].join('\n'),
  };
}
