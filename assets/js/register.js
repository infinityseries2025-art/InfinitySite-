/* =========================================================
   Регистрация команды — заявка уходит в Firestore
   со статусом "pending" и появляется в панели admin.html
   для одобрения/отклонения организатором.
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('register-form');
  const statusBox = document.getElementById('register-status');
  const submitBtn = document.getElementById('register-submit');
  if(!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusBox.className = '';
    statusBox.textContent = '';

    const data = {
      teamName: form.teamName.value.trim(),
      game: form.game.value,
      captainName: form.captainName.value.trim(),
      contact: form.contact.value.trim(),
      roster: form.roster.value.trim(),
      note: form.note.value.trim(),
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if(!data.teamName || !data.captainName || !data.contact || !data.roster){
      statusBox.textContent = 'Заполни, пожалуйста, все обязательные поля.';
      statusBox.className = 'form-msg error';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем…';

    try{
      await db.collection('teamApplications').add(data);
      form.reset();
      statusBox.textContent = 'Заявка отправлена! Она появится на сайте после проверки организатором.';
      statusBox.className = 'form-msg success';
    }catch(err){
      console.error(err);
      statusBox.textContent = 'Не получилось отправить заявку. Попробуй ещё раз чуть позже.';
      statusBox.className = 'form-msg error';
    }finally{
      submitBtn.disabled = false;
      submitBtn.textContent = 'Отправить заявку';
    }
  });
});
