import React from 'react';
import { componentDecorators } from '../Pages/config/Decorators';
import CropStatusInfoBox from '../../components/CropCatalogue/CropStatusInfoBox';

export default {
  title: 'Components/CropStatusInfoBox',
  component: CropStatusInfoBox,
  decorators: componentDecorators,
};

const Template = (args) => <CropStatusInfoBox {...args} />;
export const Default = Template.bind({});
Default.args = {
  status: {
    active: 8,
    planned: 8,
    past: 8,
    needsPlan: 8,
  },
  // defaultDate: 'Sept 12, 2021',
};

export const WithoutStatus = Template.bind({});
WithoutStatus.args = {
  // defaultDate: 'Sept 12, 2021',
};
